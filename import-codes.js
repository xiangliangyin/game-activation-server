const { db } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function importCodes() {
    console.log('🚀 开始导入激活码到数据库...');
    
    // 读取你的 codes.txt 文件
    const filePath = path.join(__dirname, 'codes.txt');
    if (!fs.existsSync(filePath)) {
        console.error('❌ 错误：codes.txt 文件不存在');
        console.log('请将包含激活码的 codes.txt 文件放在项目根目录');
        process.exit(1);
    }
    
    // 禁用索引加速插入
    console.log('⏳ 禁用索引以加速导入...');
    try {
        await db.query('DROP INDEX IF EXISTS idx_code_hash');
        await db.query('DROP INDEX IF EXISTS idx_is_used');
    } catch (error) {
        console.log('索引可能不存在，继续...');
    }
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
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
            batch.push(`('${code}')`);
            
            if (batch.length >= batchSize) {
                const query = `
                    INSERT INTO activation_codes (code) 
                    VALUES ${batch.join(',')}
                    ON CONFLICT (code) DO NOTHING
                `;
                const result = await db.query(query);
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
        const query = `
            INSERT INTO activation_codes (code) 
            VALUES ${batch.join(',')}
            ON CONFLICT (code) DO NOTHING
        `;
        const result = await db.query(query);
        insertedCount += result.rowCount || batch.length;
    }
    
    // 重新创建索引
    console.log('🔧 重新创建索引...');
    await db.query(`
        CREATE INDEX idx_code_hash 
        ON activation_codes USING HASH (code)
    `);
    await db.query(`
        CREATE INDEX idx_is_used 
        ON activation_codes (is_used)
    `);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n🎉 ====== 导入完成 ======');
    console.log(`📊 总处理行数: ${totalCount}`);
    console.log(`✅ 成功插入行数: ${insertedCount}`);
    console.log(`⚠️  重复行数: ${totalCount - insertedCount}`);
    console.log(`⏱️  总耗时: ${duration.toFixed(2)} 秒`);
    console.log(`🚀 平均速度: ${Math.round(insertedCount / duration)} 条/秒`);
    
    // 验证数据
    const verify = await db.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN is_used THEN 1 ELSE 0 END) as used,
            SUM(CASE WHEN NOT is_used THEN 1 ELSE 0 END) as available
        FROM activation_codes
    `);
    
    console.log('\n🔍 数据库验证结果：');
    console.log(`   📦 总记录数: ${verify.rows[0].total}`);
    console.log(`   ✅ 可用激活码: ${verify.rows[0].available || 0}`);
    console.log(`   ⏳ 已使用激活码: ${verify.rows[0].used || 0}`);
    
    process.exit(0);
}

// 运行导入
importCodes().catch(error => {
    console.error('❌ 导入失败:', error);
    process.exit(1);
});
