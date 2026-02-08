// /scripts/verify.js - 验证系统状态
const { Pool } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function verifySystem() {
    console.log('🔍 开始验证激活系统...\n');
    
    // 1. 检查环境变量
    console.log('1. 📋 检查环境变量:');
    const postgresUrl = process.env.POSTGRES_URL;
    const databaseUrl = process.env.DATABASE_URL;
    
    console.log(`   POSTGRES_URL: ${postgresUrl ? '✅ 已设置' : '❌ 未设置'}`);
    console.log(`   DATABASE_URL: ${databaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
    
    const connectionString = postgresUrl || databaseUrl;
    
    if (!connectionString) {
        console.log('\n❌ 错误：未设置数据库连接字符串！');
        console.log('\n解决方案：');
        console.log('1. 对于本地开发：创建 .env.local 文件');
        console.log('2. 对于 Vercel：在项目设置中添加环境变量');
        console.log('3. 变量名：POSTGRES_URL 或 DATABASE_URL');
        console.log('4. 值：postgresql://username:password@host.neon.tech/dbname?sslmode=require');
        return;
    }
    
    console.log(`   使用连接: ${connectionString.substring(0, 30)}...\n`);
    
    // 2. 测试数据库连接
    console.log('2. 🔌 测试数据库连接:');
    const pool = new Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        const client = await pool.connect();
        console.log('   ✅ 数据库连接成功\n');
        
        // 3. 检查激活码数据
        console.log('3. 📊 检查激活码数据:');
        
        // 3.1 总数统计
        const countResult = await client.query('SELECT COUNT(*) FROM activation_codes');
        const total = parseInt(countResult.rows[0].count);
        console.log(`   总激活码数: ${total.toLocaleString()}`);
        
        if (total === 0) {
            console.log('   ⚠️ 警告：数据库中没有激活码！');
            console.log('   请运行: node scripts/import-codes.js');
        }
        
        // 3.2 使用情况统计
        const usedResult = await client.query('SELECT COUNT(*) FROM activation_codes WHERE is_used = true');
        const used = parseInt(usedResult.rows[0].count);
        console.log(`   已使用数: ${used.toLocaleString()}`);
        
        const availableResult = await client.query('SELECT COUNT(*) FROM activation_codes WHERE is_used = false');
        const available = parseInt(availableResult.rows[0].count);
        console.log(`   可用数: ${available.toLocaleString()}`);
        
        const usageRate = total > 0 ? ((used / total) * 100).toFixed(2) : 0;
        console.log(`   使用率: ${usageRate}%\n`);
        
        // 3.3 检查数据格式
        console.log('4. 🔎 检查数据格式:');
        const sampleResult = await client.query(
            'SELECT code FROM activation_codes LIMIT 3'
        );
        
        if (sampleResult.rowCount > 0) {
            sampleResult.rows.forEach((row, index) => {
                const code = row.code;
                console.log(`   样本 ${index + 1}: ${code}`);
                console.log(`       长度: ${code.length} ${code.length === 20 ? '✅' : '❌'}`);
                console.log(`       格式: ${/^[0-9a-z]{20}$/.test(code) ? '✅' : '❌'}`);
                console.log(`       小写: ${code === code.toLowerCase() ? '✅' : '❌'}`);
                console.log('');
            });
        }
        
        // 3.4 表结构检查
        console.log('5. 🗃️ 检查表结构:');
        const tableInfo = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'activation_codes'
            ORDER BY ordinal_position
        `);
        
        console.log('   表字段结构:');
        tableInfo.rows.forEach(col => {
            console.log(`     - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(可为空)' : '(非空)'}`);
        });
        
        client.release();
        await pool.end();
        
        console.log('\n🎉 验证完成！');
        console.log('\n✅ 所有检查通过，系统准备就绪');
        console.log('\n下一步：');
        console.log('1. 本地开发: npm run dev');
        console.log('2. 访问: http://localhost:3000');
        console.log('3. 部署: npm run deploy');
        
    } catch (error) {
        console.log(`   ❌ 数据库连接失败: ${error.message}`);
        console.log('\n可能的原因：');
        console.log('1. 连接字符串错误');
        console.log('2. 数据库服务未启动');
        console.log('3. IP 地址未在白名单中（Neon 需要添加当前 IP）');
        console.log('4. SSL 配置问题');
    }
}

// 执行验证
verifySystem().catch(console.error);
