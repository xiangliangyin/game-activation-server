const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function importBatch(startFrom = 0, batchLimit = 100000) {
    console.log(`🔄 批次导入：从第 ${startFrom} 条开始，限制 ${batchLimit} 条`);
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    
    try {
        const filePath = path.join(__dirname, 'codes.txt');
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let currentLine = 0;
        let importedCount = 0;
        let batch = [];
        const batchSize = 10000;
        
        const startTime = Date.now();
        
        for await (const line of rl) {
            currentLine++;
            
            // 跳过之前的行
            if (currentLine <= startFrom) continue;
            
            // 限制导入数量
            if (importedCount >= batchLimit) break;
            
            const code = line.trim();
            if (code.length === 20) {
                batch.push(code);
                importedCount++;
                
                if (batch.length >= batchSize) {
                    await client.query(
                        `INSERT INTO activation_codes (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING`,
                        [batch]
                    );
                    batch = [];
                    
                    console.log(`✅ 已导入 ${importedCount}/${batchLimit} 条`);
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
        }
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`\n🎉 批次完成！`);
        console.log(`📊 本次导入: ${importedCount} 条`);
        console.log(`📊 累计行数: ${currentLine} 行`);
        console.log(`⏱️  本次耗时: ${duration.toFixed(1)} 秒`);
        
        if (importedCount >= batchLimit) {
            console.log(`\n🔄 还有更多数据，继续导入命令:`);
            console.log(`node import-batch.js ${currentLine} ${batchLimit}`);
        }
        
    } catch (error) {
        console.error('批次导入失败:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

// 获取命令行参数
const startFrom = parseInt(process.argv[2]) || 0;
const batchLimit = parseInt(process.argv[3]) || 100000;

importBatch(startFrom, batchLimit).catch(console.error);
