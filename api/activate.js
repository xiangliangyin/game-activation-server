// /api/activate.js - 激活码验证接口
const pool = require('../lib/db');

module.exports = async (req, res) => {
    // === 1. 设置 CORS 头 ===
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log(`[${new Date().toISOString()}] 激活请求: ${req.method} ${req.url}`);
    
    // === 2. 获取激活码参数 ===
    let code, usedBy = 'anonymous';
    
    if (req.method === 'GET') {
        // GET 请求：从查询参数获取
        code = req.query.code;
        usedBy = req.query.user_id || 'anonymous';
    } else if (req.method === 'POST') {
        // POST 请求：从请求体获取
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            code = body.code;
            usedBy = body.user_id || 'anonymous';
        } catch (error) {
            console.error('JSON 解析错误:', error.message);
            return res.status(400).json({ 
                ok: false, 
                error: '无效的 JSON 数据格式' 
            });
        }
    } else {
        // 不允许其他方法
        return res.status(405).json({ 
            ok: false, 
            error: '只支持 GET 和 POST 请求' 
        });
    }
    
    // === 3. 验证激活码格式 ===
    if (!code || typeof code !== 'string') {
        console.log('激活码为空或不是字符串');
        return res.json({ 
            ok: false, 
            error: '激活码不能为空' 
        });
    }
    
    // 清理和标准化
    code = code.trim().toLowerCase();
    
    // 格式验证：20位，仅包含数字和小写字母
    if (code.length !== 20) {
        console.log(`激活码长度错误: ${code.length} (应为20)`);
        return res.json({ 
            ok: false, 
            error: '激活码长度必须为20位' 
        });
    }
    
    if (!/^[0-9a-z]{20}$/.test(code)) {
        console.log(`激活码格式错误: ${code}`);
        return res.json({ 
            ok: false, 
            error: '激活码只能包含数字0-9和字母a-z' 
        });
    }
    
    console.log(`验证激活码: "${code}", 用户: "${usedBy}"`);
    
    // === 4. 数据库操作 ===
    const client = await pool.connect();
    
    try {
        // 4.1 首先检查激活码是否存在
        console.log('查询数据库...');
        const checkResult = await client.query(
            'SELECT code, is_used, used_by, used_at FROM activation_codes WHERE code = $1',
            [code]
        );
        
        // 4.2 激活码不存在
        if (checkResult.rowCount === 0) {
            console.log(`❌ 激活码不存在: ${code}`);
            return res.json({ 
                ok: false, 
                error: '激活码无效' 
            });
        }
        
        const row = checkResult.rows[0];
        
        // 4.3 激活码已使用
        if (row.is_used) {
            console.log(`⚠️ 激活码已使用: ${code}, 原用户: ${row.used_by || 'unknown'}`);
            return res.json({ 
                ok: false, 
                error: '激活码已使用',
                used_by: row.used_by,
                used_at: row.used_at
            });
        }
        
        // 4.4 标记为已使用
        console.log('尝试激活...');
        const updateResult = await client.query(
            `UPDATE activation_codes 
             SET is_used = true, 
                 used_at = NOW(),
                 used_by = $2
             WHERE code = $1 AND is_used = false
             RETURNING code, used_at, used_by`,
            [code, usedBy]
        );
        
        // 4.5 激活成功
        if (updateResult.rowCount === 1) {
            console.log(`✅ 激活成功: ${code}, 用户: ${usedBy}`);
            return res.json({
                ok: true,
                message: '激活成功',
                code: updateResult.rows[0].code,
                used_by: updateResult.rows[0].used_by,
                used_at: updateResult.rows[0].used_at,
                timestamp: new Date().toISOString()
            });
        }
        
        // 4.6 并发冲突情况（理论上很少发生）
        console.log(`⚠️ 激活冲突: ${code}`);
        return res.json({ 
            ok: false, 
            error: '激活过程中发生冲突，请重试' 
        });
        
    } catch (error) {
        // 4.7 数据库错误
        console.error(`💥 数据库错误: ${error.message}`);
        console.error(error.stack);
        
        return res.status(500).json({ 
            ok: false, 
            error: '服务器内部错误',
            detail: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
        
    } finally {
        // 4.8 释放数据库连接
        client.release();
    }
};

// 可选：优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，关闭数据库连接池...');
    pool.end();
});
