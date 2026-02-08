const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function importCodes() {
    console.log('🚀 开始导入激活码（连接池版）...');
    
    // 1. 检查文件
    const filePath = path.join(__dirname, 'codes.txt');
    if (!fs.existsSync(filePath)) {
        console.error('❌ 错误：codes.txt 文件不存在');
        console.log('请将包含激活码的 codes.txt 文件放在项目根目录');
        console.log('每行一个20位激活码，例如：');
        console.log('ABCDE12345FGHIJ67890');
        console.log('FGHIJ67890ABCDE12345');
        process.exit(1);
    }
    
    // 2. 创建专用导入连接池
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        max: 10,                    // 导入可以多用一些连接
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });
    
    const client = await pool.connect();
    
    try {
        console.log('✅ 数据库连接成功');
        
        // 3. 检查表是否存在
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'activation_codes'
            ) as table_exists
        `);
        
        if (!tableCheck.rows[0].table_exists) {
            console.error('❌ 错误：activation_codes 表不存在');
            console.log('请先在 Neon 控制台创建表：');
            console.log(`
CREATE TABLE activation_codes (
    code VARCHAR(20) PRIMARY KEY,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_code_hash ON activation_codes USING HASH (code);
CREATE INDEX idx_is_used ON activation_codes (is_used);
            `);
            process.exit(1);
        }
        
        // 4. 禁用索引加速导入
        console.log('⏳ 禁用索引以加速导入...');
        try {
            await client.query('DROP INDEX IF EXISTS idx_code_hash');
            await client.query('DROP INDEX IF EXISTS idx_is_used');
            await client.query('DROP INDEX IF EXISTS idx_used_at');
            await client.query('DROP INDEX IF EXISTS idx_used_by');
        } catch (error) {
            console.log('⚠️  某些索引可能不存在，继续...');
        }
        
        // 5. 创建临时表
        console.log('📋 创建临时表...');
        await client.query(`
            CREATE TEMPORARY TABLE temp_codes_import (
                code VARCHAR(20) PRIMARY KEY
            ) ON COMMIT DROP
        `);
        
        // 6. 读取文件并批量导入
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        const batchSize = 20000;
        let batch = [];
        let totalProcessed = 0;
        let insertedCount = 0;
        
        console.log('📥 开始读取文件并批量插入...');
        const startTime = Date.now();
        
        for await (const line of rl) {
            const code = line.trim();
            if (code.length === 20) {
                totalProcessed++;
                batch.push(code);
                
                if (batch.length >= batchSize) {
                    // 使用 UNNEST 批量插入临时表
                    const result = await client.query(
                        `INSERT INTO temp_codes_import (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING`,
                        [batch]
                    );
                    insertedCount += result.rowCount || batch.length;
                    batch = [];
                    
                    // 进度显示
                    if (totalProcessed % 100000 === 0) {
                        console.log(`✅ 已处理 ${totalProcessed.toLocaleString()} 条，已插入 ${insertedCount.toLocaleString()} 条`);
                    }
                }
            }
        }
        
        // 最后一批
        if (batch.length > 0) {
            const result = await client.query(
                `INSERT INTO temp_codes_import (code) 
                 SELECT UNNEST($1::VARCHAR[])
                 ON CONFLICT (code) DO NOTHING`,
                [batch]
            );
            insertedCount += result.rowCount || batch.length;
        }
        
        console.log(`📊 临时表插入完成，开始导入主表...`);
        
        // 7. 从临时表导入到主表
        const finalResult = await client.query(`
            INSERT INTO activation_codes (code)
            SELECT code FROM temp_codes_import
            ON CONFLICT (code) DO NOTHING
            RETURNING code
        `);
        
        const finalInserted = finalResult.rowCount;
        
        // 8. 重新创建索引
        console.log('🔧 重新创建索引...');
        await client.query('CREATE INDEX idx_code_hash ON activation_codes USING HASH (code)');
        await client.query('CREATE INDEX idx_is_used ON activation_codes (is_used)');
        await client.query('CREATE INDEX idx_used_at ON activation_codes (used_at)');
        await client.query('CREATE INDEX idx_used_by ON activation_codes (used_by)');
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // 9. 输出结果
        console.log('\n🎉 ====== 导入完成 ======');
        console.log('='.repeat(50));
        console.log(`📊 文件总行数: ${totalProcessed.toLocaleString()}`);
        console.log(`✅ 成功导入: ${finalInserted.toLocaleString()}`);
        console.log(`⚠️  重复跳过: ${(totalProcessed - finalInserted).toLocaleString()}`);
        console.log(`⏱️  总耗时: ${duration.toFixed(2)} 秒`);
        console.log(`🚀 平均速度: ${Math.round(finalInserted / duration).toLocaleString()} 条/秒`);
        console.log('='.repeat(50));
        
        // 10. 验证数据
        console.log('\n🔍 验证导入结果...');
        const verify = await client.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_used) as used,
                COUNT(*) FILTER (WHERE NOT is_used) as available
            FROM activation_codes
        `);
        
        const totalInDB = parseInt(verify.rows[0].total);
        const usedInDB = parseInt(verify.rows[0].used || 0);
        const availableInDB = parseInt(verify.rows[0].available || 0);
        
        console.log(`📦 数据库统计:`);
        console.log(`   总记录数: ${totalInDB.toLocaleString()}`);
        console.log(`   已使用: ${usedInDB.toLocaleString()}`);
        console.log(`   可用: ${availableInDB.toLocaleString()}`);
        
        // 11. 显示一些样本
        const samples = await client.query(`
            SELECT code, created_at 
            FROM activation_codes 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        console.log('\n📋 最新激活码样本:');
        samples.rows.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.code} (${row.created_at.toISOString()})`);
        });
        
        console.log('\n✅ 导入完成！现在可以测试API了。');
        console.log(`🔗 测试命令: curl "https://你的项目.vercel.app/api/activate?code=${samples.rows[0]?.code || '你的激活码'}"`);
        
    } catch (error) {
        console.error('❌ 导入失败:', error.message);
        console.error('错误详情:', error);
        process.exit(1);
    } finally {
        // 清理资源
        client.release();
        await pool.end();
        console.log('\n🔒 数据库连接已关闭');
    }
}

// 运行导入
importCodes().catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
});
