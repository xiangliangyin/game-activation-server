const { db } = require('@vercel/postgres');
module.exports = async (req, res) => {
    // 保持完全一致的 CORS 设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    // 获取激活码（完全兼容原GET请求）
    const code = req.query.code;
    // 完全相同的验证逻辑
    if (!code || code.length !== 20) {
        return res.json({
            ok: false,
            error: '激活码无效'
        });
    }
    try {
        // 🔥 核心：使用数据库事务替换文件操作
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            // 查找并标记为已使用（原子操作）
            const result = await client.query(
                `UPDATE activation_codes 
                 SET is_used = TRUE, 
                     used_at = CURRENT_TIMESTAMP
                 WHERE code = $1 
                   AND is_used = FALSE
                 RETURNING code`,
                [code]
            );
            await client.query('COMMIT');
            // 与原代码完全一致的返回格式
            if (result.rows.length === 0) {
                // 检查是否已使用
                const checkResult = await client.query(
                    'SELECT code FROM activation_codes WHERE code = $1 AND is_used = TRUE',
                    [code]
                );
                if (checkResult.rows.length > 0) {
                    return res.json({
                        ok: false,
                        error: '激活码已使用'
                    });
                }
                return res.json({
                    ok: false,
                    error: '激活码无效'
                });
            }
            // 激活成功 - 与原代码完全一致
            return res.json({
                ok: true
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('数据库错误:', error);
        
        // 保持相同的错误返回格式
        return res.status(500).json({
            ok: false,
            error: '服务器内部错误'
        });
    }
};
