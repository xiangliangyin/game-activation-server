// api/activate.js
const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const code = req.query.code;
    if (!code || code.length !== 20) {
        return res.json({ ok: false, error: '激活码无效' });
    }
    
    // 可选：获取使用者信息
    const usedBy = req.headers['x-user-id'] || 
                   req.query.user_id || 
                   'anonymous';
    
    try {
        const sql = neon(process.env.DATABASE_URL);
        const client = await sql();
        
        await client.query('BEGIN');
        
        // 更新时设置 used_by
        const result = await client.query(
            `UPDATE activation_codes 
             SET is_used = TRUE, 
                 used_at = CURRENT_TIMESTAMP,
                 used_by = $2
             WHERE code = $1 
               AND is_used = FALSE
             RETURNING code`,
            [code, usedBy]  // 第二个参数是 used_by
        );
        
        await client.query('COMMIT');
        await client.end();
        
        if (result.rows.length === 0) {
            const checkResult = await client.query(
                'SELECT code FROM activation_codes WHERE code = $1 AND is_used = TRUE',
                [code]
            );
            
            if (checkResult.rows.length > 0) {
                return res.json({ ok: false, error: '激活码已使用' });
            }
            return res.json({ ok: false, error: '激活码无效' });
        }
        
        return res.json({ ok: true });
        
    } catch (error) {
        console.error('数据库错误:', error);
        return res.status(500).json({ 
            ok: false, 
            error: '服务器内部错误' 
        });
    }
};
