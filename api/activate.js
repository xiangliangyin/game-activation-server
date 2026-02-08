// api/activate-pool.js - 连接池版本（高性能）
import { Pool } from '@neondatabase/serverless';

// 创建连接池
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    max: 20, // 最大连接数
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const code = req.query.code;
    
    if (!code || code.length !== 20) {
        return res.json({
            ok: false,
            error: '激活码无效'
        });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
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
        
        if (result.rows.length === 0) {
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
        
        return res.json({ ok: true });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('数据库错误:', error);
        return res.status(500).json({
            ok: false,
            error: '服务器内部错误'
        });
    } finally {
        client.release();
    }
}
