// scripts/import-codes.js - 导入激活码到数据库
const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function importBatch(startFrom = 0, batchLimit = 100000) {
    console.log(`🔄 批次导入：从第 ${startFrom} 条开始，限制 ${batchLimit} 条`);
    
    // 检查环境变量
    console.log('📋 环境变量检查:');
    console.log('- POSTGRES_URL:', process.env.POSTGRES_URL ? '✅ 已设置' : '❌ 未设置');
    console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '✅ 已设置' : '❌ 未设置');
    
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
        console.error('❌ 错误：未设置数据库连接字符串！');
        console.error('请设置环境变量 POSTGRES_URL 或 DATABASE_URL');
        process.exit(1);
    }
    
    // 创建连接池（带 SSL 配置）
    const pool = new Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10
    });
    
    const client = await pool.connect();
    
    try {
        const filePath = path.join(__dirname, '../codes.txt'); // 注意路径变化！
        console.log(`📁 读取文件: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ 错误：文件不存在: ${filePath}`);
            console.log('请确保 codes.txt 文件在项目根目录');
            process.exit(1);
        }
        
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let currentLine = 0;
        let importedCount = 0;
        let batch = [];
        const batchSize = 5000; // 减小批次大小，避免内存问题
        
        const startTime = Date.now();
        
        console.log('📊 开始读取文件...');
        
        for await (const line of rl) {
            currentLine++;
            
            // 跳过之前的行
            if (currentLine <= startFrom) continue;
            
            // 限制导入数量
            if (importedCount >= batchLimit) break;
            
            const code = line.trim();
            
            // 验证激活码格式
            if (code.length === 20 && /^[0-9a-z]{20}$/.test(code)) {
                batch.push(code);
                importedCount++;
                
                // 批次插入
                if (batch.length >= batchSize) {
                    console.log(`⏳ 插入批次: ${importedCount}/${batchLimit} 条...`);
                    
                    await client.query(
                        `INSERT INTO activation_codes (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING`,
                        [batch]
                    );
                    
                    batch = [];
                    
                    // 显示进度
                    const progress = ((importedCount / batchLimit) * 100).toFixed(1);
                    console.log(`📈 进度: ${progress}% (${importedCount}/${batchLimit})`);
                }
            } else if (code.length > 0) {
                console.log(`⚠️ 跳过第 ${currentLine} 行，格式错误: "${code}" (长度: ${code.length})`);
            }
        }
        
        // 最后一批
        if (batch.length > 0) {
            console.log(`⏳ 插入最后一批: ${batch.length} 条...`);
            await client.query(
                `INSERT INTO activation_codes (code) 
                 SELECT UNNEST($1::VARCHAR[])
                 ON CONFLICT (code) DO NOTHING`,
                [batch]
            );
        }
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\n🎉 批次导入完成！');
        console.log(`📊 本次导入: ${importedCount} 条`);
        console.log(`📊 处理行数: ${currentLine} 行`);
        console.log(`⏱️  本次耗时: ${duration.toFixed(1)} 秒`);
        console.log(`📈 平均速度: ${(importedCount / duration).toFixed(0)} 条/秒`);
        
        // 验证数据库中的数据
        console.log('\n🔍 验证数据库数据...');
        const result = await client.query('SELECT COUNT(*) as count FROM activation_codes');
        console.log(`📊 数据库总记录数: ${parseInt(result.rows[0].count).toLocaleString()} 条`);
        
        if (importedCount >= batchLimit) {
            console.log(`\n🔄 还有更多数据，继续导入命令:`);
            console.log(`npm run import ${currentLine} ${batchLimit}`);
        } else {
            console.log(`\n✅ 全部数据导入完成！`);
            console.log(`📁 总文件行数: ${currentLine}`);
            console.log(`🗃️  数据库总数: ${parseInt(result.rows[0].count).toLocaleString()}`);
            
            if (currentLine > parseInt(result.rows[0].count)) {
                console.log(`⚠️  注意：有 ${currentLine - parseInt(result.rows[0].count)} 条重复或无效数据被跳过`);
            }
        }
        
    } catch (error) {
        console.error('❌ 导入失败:', error.message);
        console.error(error.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

// 获取命令行参数
const startFrom = parseInt(process.argv[2]) || 0;
const batchLimit = parseInt(process.argv[3]) || 100000;

console.log('🚀 激活码导入工具');
console.log('==================');

// 检查是否在 scripts 目录
const currentDir = __dirname;
if (!currentDir.includes('scripts')) {
    console.warn('⚠️ 警告：建议在 scripts 目录下运行此脚本');
}

importBatch(startFrom, batchLimit).catch(console.error);
