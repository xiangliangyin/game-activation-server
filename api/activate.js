const { Pool } = require('@neondatabase/serverless');

// 🔥 创建全局连接池（只需创建一次）
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,                    // 最大连接数
    idleTimeoutMillis: 30000,   // 空闲连接30秒后释放
    connectionTimeoutMillis: 5000, // 连接超时5秒
});

module.exports = async (req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 支持 GET 和 POST
    let code, usedBy;
    if (req.method === 'GET') {
        code = req.query.code;
        usedBy = req.query.user_id || req.headers['x-user-id'] || 'anonymous';
    } else if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            code = body.code;
            usedBy = body.user_id || body.used_by || req.headers['x-user-id'] || 'anonymous';
        } catch (error) {
            code = null;
        }
    } else {
        return res.status(405).json({ ok: false, error: '只支持 GET 和 POST 请求' });
    }
    
    // 验证激活码
    if (!code || typeof code !== 'string' || code.length !== 20) {
        return res.json({ 
            ok: false, 
            error: '激活码无效，必须为20位字符串' 
        });
    }
    
    // 获取数据库连接
    const client = await pool.connect();
    const startTime = Date.now();
    
    try {
        // 开始事务
        await client.query('BEGIN');
        
        // 🔥 使用 used_by 字段的更新语句
        const result = await client.query(
            `UPDATE activation_codes 
             SET is_used = TRUE, 
                 used_at = CURRENT_TIMESTAMP,
                 used_by = $2
             WHERE code = $1 
               AND is_used = FALSE
             RETURNING code, used_at, used_by`,
            [code, usedBy]
        );
        
        // 提交事务
        await client.query('COMMIT');
        
        // 处理结果
        if (result.rowCount === 0) {
            // 检查激活码是否存在
            const checkResult = await client.query(
                'SELECT code, is_used, used_by, used_at FROM activation_codes WHERE code = $1',
                [code]
            );
            
            if (checkResult.rowCount === 0) {
                // 激活码不存在
                console.log(`[${new Date().toISOString()}] 激活码不存在: ${code}, 使用者: ${usedBy}`);
                return res.json({ 
                    ok: false, 
                    error: '激活码无效'
                });
            } else {
                // 激活码已使用
                const row = checkResult.rows[0];
                console.log(`[${new Date().toISOString()}] 激活码已使用: ${code}, 原使用者: ${row.used_by}, 新尝试者: ${usedBy}`);
                return res.json({ 
                    ok: false, 
                    error: '激活码已使用',
                    used_by: row.used_by,        // 可选：返回谁使用的
                    used_at: row.used_at         // 可选：返回使用时间
                });
            }
        }
        
        // 🔥 激活成功！
        const row = result.rows[0];
        const responseTime = Date.now() - startTime;
        
        console.log(`[${new Date().toISOString()}] 激活成功: ${code}, 使用者: ${usedBy}, 耗时: ${responseTime}ms`);
        
        return res.json({
            ok: true,
            message: '激活成功',
            code: row.code,
            used_by: row.used_by,      // 返回使用者
            used_at: row.used_at,      // 返回使用时间
            response_time: responseTime + 'ms'
        });
        
    } catch (error) {
        // 回滚事务
        await client.query('ROLLBACK').catch(() => {}); // 忽略回滚错误
        
        console.error(`[${new Date().toISOString()}] 激活错误: ${code}, 错误:`, error.message);
        
        return res.status(500).json({
            ok: false,
            error: '服务器内部错误',
            detail: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
        
    } finally {
        // 🔥 重要：释放连接回连接池（不是关闭！）
        client.release();
    }
};

// 可选：优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，关闭数据库连接池...');
    pool.end();
});
