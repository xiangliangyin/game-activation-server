// /api/activate.js
const pool = require('../lib/db');

module.exports = async (req, res) => {
    // CORS 设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log(`激活请求: ${req.method} ${req.url}`);
    
    // 获取激活码
    let code, usedBy = 'anonymous';
    
    if (req.method === 'GET') {
        code = req.query.code;
        usedBy = req.query.user_id || 'anonymous';
    } else if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            code = body.code;
            usedBy = body.user_id || 'anonymous';
        } catch {
            return res.status(400).json({ ok: false, error: '无效的JSON数据' });
        }
    } else {
        return res.status(405).json({ ok: false, error: '只支持GET和POST请求' });
    }
    
    // 验证激活码
    if (!code || typeof code !== 'string') {
        return res.json({ ok: false, error: '激活码不能为空' });
    }
    
    code = code.trim().toLowerCase();
    
    if (code.length !== 20 || !/^[0-9a-z]{20}$/.test(code)) {
        return res.json({ ok: false, error: '激活码格式错误' });
    }
    
    console.log(`验证激活码: ${code}, 用户: ${usedBy}`);
    
    try {
        const client = await pool.connect();
        
        try {
            // 检查激活码是否存在
            const checkResult = await client.query(
                'SELECT is_used, used_by FROM activation_codes WHERE code = $1',
                [code]
            );
            
            if (checkResult.rowCount === 0) {
                console.log(`激活码不存在: ${code}`);
                return res.json({ ok: false, error: '激活码无效' });
            }
            
            if (checkResult.rows[0].is_used) {
                console.log(`激活码已使用: ${code}, 使用者: ${checkResult.rows[0].used_by}`);
                return res.json({ 
                    ok: false, 
                    error: '激活码已使用',
                    used_by: checkResult.rows[0].used_by
                });
            }
            
            // 更新为已使用
            const updateResult = await client.query(
                `UPDATE activation_codes 
                 SET is_used = true, used_at = NOW(), used_by = $2
                 WHERE code = $1 AND is_used = false
                 RETURNING code, used_at, used_by`,
                [code, usedBy]
            );
            
            if (updateResult.rowCount === 1) {
                console.log(`✅ 激活成功: ${code}`);
                return res.json({
                    ok: true,
                    message: '激活成功',
                    code: updateResult.rows[0].code,
                    used_by: updateResult.rows[0].used_by,
                    used_at: updateResult.rows[0].used_at
                });
            }
            
            return res.json({ ok: false, error: '激活失败，请重试' });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('数据库错误:', error);
        return res.status(500).json({ 
            ok: false, 
            error: '服务器内部错误'
        });
    }
};
