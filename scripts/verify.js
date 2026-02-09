// scripts/verify.js - 系统验证工具
const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

async function verifySystem() {
    console.log('🔍 开始验证激活系统...\n');
    
    // ==================== 1. 检查环境变量 ====================
    console.log('1. 📋 检查环境变量:');
    
    const postgresUrl = process.env.POSTGRES_URL;
    const databaseUrl = process.env.DATABASE_URL;
    
    console.log(`   POSTGRES_URL: ${postgresUrl ? '✅ 已设置' : '❌ 未设置'}`);
    console.log(`   DATABASE_URL: ${databaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
    
    const connectionString = postgresUrl || databaseUrl;
    
    if (!connectionString) {
        console.log('\n❌ 错误：未设置数据库连接字符串！');
        console.log('\n解决方案：');
        console.log('1. 本地开发：创建 .env.local 文件');
        console.log('2. Vercel：在项目设置中添加环境变量');
        console.log('3. 变量名：POSTGRES_URL 或 DATABASE_URL');
        console.log('4. 值格式：postgresql://用户名:密码@xxx.neon.tech/dbname?sslmode=require');
        return;
    }
    
    console.log(`   连接字符串: ${connectionString.substring(0, 50)}...\n`);
    
    // ==================== 2. 检查激活码文件 ====================
    console.log('2. 📁 检查激活码文件:');
    
    const codesFilePath = path.join(__dirname, '../codes.txt');
    
    if (fs.existsSync(codesFilePath)) {
        const stats = fs.statSync(codesFilePath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`   ✅ 找到 codes.txt 文件`);
        console.log(`   文件大小: ${fileSizeMB} MB`);
        
        // 估算行数（平均每行20字符 + 换行符）
        const estimatedLines = Math.floor(stats.size / 22);
        console.log(`   估算行数: ${estimatedLines.toLocaleString()} 行`);
    } else {
        console.log(`   ❌ 找不到 codes.txt 文件`);
        console.log(`   请确保 codes.txt 在项目根目录`);
    }
    console.log('');
    
    // ==================== 3. 测试数据库连接 ====================
    console.log('3. 🔌 测试数据库连接:');
    
    const pool = new Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        const client = await pool.connect();
        console.log('   ✅ 数据库连接成功\n');
        
        // ==================== 4. 检查表结构 ====================
        console.log('4. 🗃️ 检查数据库表结构:');
        
        try {
            // 检查表是否存在
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'activation_codes'
                ) as table_exists
            `);
            
            if (!tableCheck.rows[0].table_exists) {
                console.log('   ❌ activation_codes 表不存在');
                console.log('   请先在 Neon 中运行 CREATE TABLE 语句');
                client.release();
                await pool.end();
                return;
            }
            
            console.log('   ✅ activation_codes 表存在');
            
            // 检查表结构
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'activation_codes'
                ORDER BY ordinal_position
            `);
            
            console.log('   表字段结构:');
            columns.rows.forEach(col => {
                console.log(`     - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(可为空)' : '(非空)'}`);
            });
            
            // 检查索引
            const indexes = await client.query(`
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE tablename = 'activation_codes'
            `);
            
            console.log('\n   表索引:');
            if (indexes.rows.length > 0) {
                indexes.rows.forEach(idx => {
                    const name = idx.indexname;
                    const type = idx.indexdef.includes('USING hash') ? '哈希索引' : 'B树索引';
                    console.log(`     - ${name}: ${type}`);
                });
            } else {
                console.log('     ⚠️ 没有索引，建议创建索引优化性能');
            }
            
        } catch (error) {
            console.log(`   ❌ 表结构检查失败: ${error.message}`);
        }
        console.log('');
        
        // ==================== 5. 检查数据 ====================
        console.log('5. 📊 检查激活码数据:');
        
        try {
            // 统计总数
            const countResult = await client.query('SELECT COUNT(*) as total FROM activation_codes');
            const total = parseInt(countResult.rows[0].total);
            
            console.log(`   总激活码数: ${total.toLocaleString()}`);
            
            if (total === 0) {
                console.log('   ⚠️ 数据库中没有激活码！');
                console.log('   请运行: node scripts/import-codes.js');
            } else {
                // 使用情况统计
                const usedResult = await client.query('SELECT COUNT(*) as used FROM activation_codes WHERE is_used = true');
                const used = parseInt(usedResult.rows[0].used);
                const available = total - used;
                
                console.log(`   已使用数: ${used.toLocaleString()}`);
                console.log(`   可用数: ${available.toLocaleString()}`);
                
                const usageRate = total > 0 ? ((used / total) * 100).toFixed(2) : 0;
                console.log(`   使用率: ${usageRate}%`);
                
                // 检查数据格式
                console.log('\n6. 🔎 检查数据格式:');
                const sampleResult = await client.query(
                    'SELECT code, is_used FROM activation_codes LIMIT 3'
                );
                
                if (sampleResult.rowCount > 0) {
                    sampleResult.rows.forEach((row, index) => {
                        const code = row.code;
                        console.log(`   样本 ${index + 1}: ${code}`);
                        console.log(`       长度: ${code.length} ${code.length === 20 ? '✅' : '❌'}`);
                        console.log(`       格式: ${/^[0-9a-z]{20}$/.test(code) ? '✅' : '❌'}`);
                        console.log(`       小写: ${code === code.toLowerCase() ? '✅' : '❌'}`);
                        console.log(`       状态: ${row.is_used ? '已使用' : '未使用'}`);
                        console.log('');
                    });
                }
                
                // 检查最近激活记录
                console.log('7. ⏰ 最近激活记录:');
                const recentResult = await client.query(`
                    SELECT code, used_by, used_at
                    FROM activation_codes 
                    WHERE used_at IS NOT NULL 
                    ORDER BY used_at DESC 
                    LIMIT 3
                `);
                
                if (recentResult.rowCount > 0) {
                    recentResult.rows.forEach(row => {
                        const time = new Date(row.used_at).toLocaleString();
                        console.log(`   - ${row.code}: ${row.used_by || '匿名'} @ ${time}`);
                    });
                } else {
                    console.log('   暂无激活记录');
                }
            }
            
        } catch (error) {
            console.log(`   ❌ 数据检查失败: ${error.message}`);
        }
        console.log('');
        
        // ==================== 8. 性能测试 ====================
        console.log('8. ⚡ 性能测试:');
        
        try {
            const startTime = Date.now();
            
            // 测试查询性能
            const perfResult = await client.query(`
                SELECT code FROM activation_codes WHERE is_used = false LIMIT 1
            `);
            
            const queryTime = Date.now() - startTime;
            
            console.log(`   简单查询耗时: ${queryTime}ms`);
            
            if (queryTime > 100) {
                console.log(`   ⚠️ 查询较慢，建议优化索引`);
            } else {
                console.log(`   ✅ 查询性能良好`);
            }
            
        } catch (error) {
            console.log(`   性能测试失败: ${error.message}`);
        }
        
        client.release();
        await pool.end();
        
        console.log('\n🎉 验证完成！');
        console.log('\n📋 总结:');
        
        if (total > 0) {
            console.log(`✅ 数据库连接正常`);
            console.log(`✅ 表结构正确`);
            console.log(`✅ 数据量: ${total.toLocaleString()} 条`);
            console.log(`✅ 系统准备就绪`);
        } else {
            console.log(`⚠️  数据库中没有数据，需要导入激活码`);
        }
        
        console.log('\n下一步操作:');
        console.log('1. 如果数据库为空，运行: npm run import');
        console.log('2. 本地开发: npm run dev');
        console.log('3. 部署: npm run deploy');
        console.log('4. 测试API: curl http://localhost:3000/api/health');
        
    } catch (error) {
        console.log(`   ❌ 数据库连接失败: ${error.message}`);
        console.log('\n可能的原因:');
        console.log('1. 连接字符串错误');
        console.log('2. IP地址未在白名单（Neon需要添加当前IP）');
        console.log('3. SSL配置问题');
        console.log('4. 数据库服务未启动');
        
        await pool.end();
    }
}

// 运行验证
if (require.main === module) {
    verifySystem().catch(console.error);
}

module.exports = verifySystem;
