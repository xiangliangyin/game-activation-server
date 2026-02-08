const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function importCodesFixed() {
    console.log('🚀 开始修复版导入...\n');
    
    // 1. 获取数据库连接
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
        console.error('❌ 错误：请设置 DATABASE_URL 环境变量');
        console.log('执行: export DATABASE_URL="你的连接字符串"');
        process.exit(1);
    }
    
    // 2. 检查文件路径（多种可能的位置）
    let filePath;
    const possiblePaths = [
        path.join(process.cwd(), 'codes.txt'),
        path.join(__dirname, 'codes.txt'),
        path.join(__dirname, '..', 'codes.txt'),
        'codes.txt'
    ];
    
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            filePath = possiblePath;
            console.log(`✅ 找到文件: ${filePath}`);
            break;
        }
    }
    
    if (!filePath) {
        console.error('❌ 错误：找不到 codes.txt 文件');
        console.log('请在以下位置放置文件:');
        possiblePaths.forEach(p => console.log(`  - ${p}`));
        process.exit(1);
    }
    
    // 3. 检查文件内容
    console.log('\n📋 检查文件内容...');
    const sampleContent = fs.readFileSync(filePath, 'utf8');
    const lines = sampleContent.split('\n');
    
    console.log(`文件总行数: ${lines.length}`);
    
    // 分析前几行
    let validCount = 0;
    let invalidCount = 0;
    const sampleLines = lines.slice(0, 10);
    
    console.log('前10行分析:');
    sampleLines.forEach((line, index) => {
        const trimmed = line.trim();
        const isValid = trimmed.length === 20;
        
        if (trimmed) {
            console.log(`  行 ${index + 1}: "${trimmed}" (长度: ${trimmed.length}) ${isValid ? '✅' : '❌'}`);
            if (isValid) validCount++;
            else invalidCount++;
        } else {
            console.log(`  行 ${index + 1}: [空行或空白]`);
        }
    });
    
    if (validCount === 0) {
        console.error('\n❌ 错误：前10行中没有有效的20位激活码！');
        console.log('请检查文件格式：每行必须是20位字符，不能有空格');
        process.exit(1);
    }
    
    // 4. 连接数据库
    console.log('\n🔗 连接数据库...');
    const pool = new Pool({
        connectionString: dbUrl,
        max: 10,
    });
    
    const client = await pool.connect();
    
    try {
        // 检查表
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'activation_codes'
            ) as exists
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.error('❌ 错误：表不存在，正在创建...');
            await client.query(`
                CREATE TABLE activation_codes (
                    code VARCHAR(20) PRIMARY KEY,
                    is_used BOOLEAN DEFAULT FALSE,
                    used_at TIMESTAMP WITH TIME ZONE,
                    used_by VARCHAR(100),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);
            await client.query('CREATE INDEX idx_code_hash ON activation_codes USING HASH (code)');
            console.log('✅ 表创建完成');
        }
        
        // 5. 开始导入
        console.log('\n📥 开始正式导入...');
        
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        const batchSize = 5000;
        let batch = [];
        let totalRead = 0;
        let totalValid = 0;
        let totalImported = 0;
        
        const startTime = Date.now();
        let lastLogTime = Date.now();
        
        for await (const line of rl) {
            totalRead++;
            const code = line.trim();
            
            // 严格验证：必须是20位，只包含字母数字
            if (code.length === 20 && /^[A-Z0-9]{20}$/i.test(code)) {
                totalValid++;
                batch.push(code);
                
                // 批量插入
                if (batch.length >= batchSize) {
                    const result = await client.query(
                        `INSERT INTO activation_codes (code) 
                         SELECT UNNEST($1::VARCHAR[])
                         ON CONFLICT (code) DO NOTHING
                         RETURNING code`,
                        [batch]
                    );
                    
                    totalImported += result.rowCount;
                    batch = [];
                    
                    // 进度显示（每秒最多一次）
                    const now = Date.now();
                    if (now - lastLogTime > 1000) {
                        console.log(`  已处理: ${totalRead.toLocaleString()} 行, 有效: ${totalValid.toLocaleString()}, 导入: ${totalImported.toLocaleString()}`);
                        lastLogTime = now;
                    }
                }
            }
            
            // 每10万行显示一次详细进度
            if (totalRead % 100000 === 0) {
                console.log(`✅ 进度: ${totalRead.toLocaleString()} 行`);
            }
        }
        
        // 最后一批
        if (batch.length > 0) {
            const result = await client.query(
                `INSERT INTO activation_codes (code) 
                 SELECT UNNEST($1::VARCHAR[])
                 ON CONFLICT (code) DO NOTHING
                 RETURNING code`,
                [batch]
            );
            totalImported += result.rowCount;
        }
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // 6. 输出结果
        console.log('\n' + '='.repeat(60));
        console.log('🎉 导入完成！');
        console.log('='.repeat(60));
        console.log(`📊 文件统计:`);
        console.log(`   总读取行数: ${totalRead.toLocaleString()}`);
        console.log(`   有效激活码: ${totalValid.toLocaleString()}`);
        console.log(`   成功导入: ${totalImported.toLocaleString()}`);
        console.log(`   重复跳过: ${(totalValid - totalImported).toLocaleString()}`);
        console.log(`   无效格式: ${(totalRead - totalValid).toLocaleString()}`);
        console.log(`\n⏱️  性能:`);
        console.log(`   总耗时: ${duration.toFixed(1)} 秒`);
        console.log(`   导入速度: ${Math.round(totalImported / duration).toLocaleString()} 条/秒`);
        console.log('='.repeat(60));
        
        // 7. 验证数据库中的数据
        console.log('\n🔍 验证数据库数据...');
        const dbCount = await client.query('SELECT COUNT(*) as count FROM activation_codes');
        console.log(`数据库总记录数: ${parseInt(dbCount.rows[0].count).toLocaleString()}`);
        
        // 获取几个示例
        const samples = await client.query(`
            SELECT code, created_at 
            FROM activation_codes 
            ORDER BY RANDOM() 
            LIMIT 5
        `);
        
        console.log('\n📋 随机激活码示例:');
        samples.rows.forEach((row, i) => {
            console.log(`  ${i + 1}. ${row.code}`);
        });
        
        console.log(`\n🔗 测试命令:`);
        if (samples.rows.length > 0) {
            console.log(`curl "https://你的项目.vercel.app/api/activate?code=${samples.rows[0].code}"`);
        }
        
    } catch (error) {
        console.error('❌ 导入失败:', error.message);
        console.error('错误堆栈:', error.stack);
    } finally {
        client.release();
        await pool.end();
        console.log('\n🔒 数据库连接已关闭');
    }
}

// 运行修复版导入
importCodesFixed().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
});
