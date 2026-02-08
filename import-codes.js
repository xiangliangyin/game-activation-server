import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 连接数据库
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function importCodes() {
    console.log('🚀 开始导入激活码到 Neon 数据库...');
    
    const filePath = path.join(__dirname, 'codes.txt');
    if (!fs.existsSync(filePath)) {
        console.error('❌ 错误：codes.txt 文件不存在');
        process.exit(1);
    }
    
    const client = await sql();
    
    try {
        // 禁用索引加速插入
        console.log('⏳ 禁用索引...');
        try {
            await client.query('DROP INDEX IF EXISTS idx_code_hash');
            await client.query('DROP INDEX IF EXISTS idx_is_used');
        } catch (error) {
            console.log('索引可能不存在，继续...');
        }
        
        const fileStream = createReadStream(filePath);
        const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        const batchSize = 10000;
        let batch = [];
        let totalCount = 0;
        let insertedCount = 0;
        
        console.log('📥 开始批量插入数据...');
        const startTime = Date.now();
        
        for await (const line of rl) {
            const code = line.trim();
            if (code.length === 20) {
                totalCount++;
                batch.push(code);
                
                if (batch.length >= batchSize) {
                    // 使用 UNNEST 批量插入
                    const result = await client.query(
                        `INSERT INTO activation_codes (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING`,
                        [batch]
                    );
                    insertedCount += result.rowCount || batch.length;
                    batch = [];
                    
                    if (totalCount % 100000 === 0) {
                        console.log(`✅ 已处理 ${totalCount} 条，已插入 ${insertedCount} 条`);
                    }
                }
            }
        }
        
        // 插入最后一批
        if (batch.length > 0) {
            const result = await client.query(
                `INSERT INTO activation_codes (code) 
                 SELECT UNNEST($1::VARCHAR[])
                 ON CONFLICT (code) DO NOTHING`,
                [batch]
            );
            insertedCount += result.rowCount || batch.length;
        }
        
        // 重新创建索引
        console.log('🔧 重新创建索引...');
        await client.query(`
            CREATE INDEX idx_code_hash 
            ON activation_codes USING HASH (code)
        `);
        await client.query(`
            CREATE INDEX idx_is_used 
            ON activation_codes (is_used)
        `);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\n🎉 ====== 导入完成 ======');
        console.log(`📊 总处理行数: ${totalCount}`);
        console.log(`✅ 成功插入行数: ${insertedCount}`);
        console.log(`⏱️  总耗时: ${duration.toFixed(2)} 秒`);
        console.log(`🚀 平均速度: ${Math.round(insertedCount / duration)} 条/秒`);
        
    } catch (error) {
        console.error('❌ 导入失败:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// 运行导入
importCodes().catch(console.error);
