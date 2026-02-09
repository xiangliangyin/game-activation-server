// import-codes.js - Vercel自动运行
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('@neondatabase/serverless');

async function importCodes() {
    console.log('🚀 Vercel构建：开始导入激活码');
    
    // 检查环境
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
        console.log('⚠️  未设置数据库连接，跳过导入');
        return;
    }
    
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    // 检查文件
    const filePath = path.join(__dirname, 'codes.txt');
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 找不到激活码文件: ${filePath}`);
        return;
    }
    
    console.log(`📁 找到激活码文件，大小: ${fs.statSync(filePath).size} 字节`);
    
    // 连接数据库
    const pool = new Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false },
        max: 5
    });
    
    const client = await pool.connect();
    
    try {
        // 检查表是否存在
        try {
            await client.query('SELECT 1 FROM activation_codes LIMIT 1');
            console.log('✅ 数据库表存在');
        } catch (error) {
            console.error('❌ 数据库表不存在，请先在Neon中创建表');
            return;
        }
        
        // 检查现有数据
        const countResult = await client.query('SELECT COUNT(*) as count FROM activation_codes');
        const existingCount = parseInt(countResult.rows[0].count);
        
        if (existingCount > 0) {
            console.log(`📊 数据库中已有 ${existingCount.toLocaleString()} 条数据`);
            console.log('是否继续导入？(y/n)');
            // 在生产环境中，我们可以自动决定
            if (process.env.VERCEL_ENV === 'production' && existingCount > 100000) {
                console.log('✅ 生产环境已有足够数据，跳过导入');
                return;
            }
        }
        
        // 读取文件
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let imported = 0;
        let batch = [];
        const batchSize = 10000;
        let lineNumber = 0;
        
        console.log('📤 开始导入...');
        const startTime = Date.now();
        
        for await (const line of rl) {
            lineNumber++;
            const code = line.trim();
            
            if (code.length === 20 && /^[0-9a-z]{20}$/.test(code)) {
                batch.push(code);
                
                if (batch.length >= batchSize) {
                    await client.query(
                        `INSERT INTO activation_codes (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING`,
                        [batch]
                    );
                    
                    imported += batch.length;
                    batch = [];
                    
                    // 显示进度
                    if (lineNumber % 50000 === 0) {
                        console.log(`⏳ 已处理: ${lineNumber.toLocaleString()} 行`);
                    }
                }
            }
        }
        
        // 最后一批
        if (batch.length > 0) {
            await client.query(
                `INSERT INTO activation_codes (code) 
                 SELECT UNNEST($1::VARCHAR[])
                 ON CONFLICT (code) DO NOTHING`,
                [batch]
            );
            imported += batch.length;
        }
        
        const duration = (Date.now() - startTime) / 1000;
        
        console.log('\n🎉 导入完成！');
        console.log(`📊 总行数: ${lineNumber.toLocaleString()}`);
        console.log(`📊 导入条数: ${imported.toLocaleString()}`);
        console.log(`⏱️  耗时: ${duration.toFixed(1)} 秒`);
        
        // 最终统计
        const finalResult = await client.query('SELECT COUNT(*) as count FROM activation_codes');
        console.log(`🗃️  数据库总数: ${parseInt(finalResult.rows[0].count).toLocaleString()} 条`);
        
    } catch (error) {
        console.error('❌ 导入失败:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

// 如果是直接运行，则执行导入
if (require.main === module) {
    importCodes().catch(console.error);
}

module.exports = importCodes;
