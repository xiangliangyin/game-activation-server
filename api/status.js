// /api/status.js
const pool = require('../lib/db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只支持GET请求' });
    }
    
    try {
        const client = await pool.connect();
        
        try {
            // 获取基本统计
            const statsResult = await client.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_used THEN 1 END) as used,
                    COUNT(CASE WHEN NOT is_used THEN 1 END) as available
                FROM activation_codes
            `);
            
            const stats = statsResult.rows[0];
            
            // 获取最近激活记录
            const recentResult = await client.query(`
                SELECT code, used_by, used_at
                FROM activation_codes 
                WHERE used_at IS NOT NULL 
                ORDER BY used_at DESC 
                LIMIT 5
            `);
            
            const response = {
                ok: true,
                timestamp: new Date().toISOString(),
                stats: {
                    total: parseInt(stats.total) || 0,
                    used: parseInt(stats.used) || 0,
                    available: parseInt(stats.available) || 0
                },
                recent_activations: recentResult.rows.map(row => ({
                    code: row.code,
                    used_by: row.used_by || '匿名用户',
                    used_at: row.used_at
                }))
            };
            
            res.status(200).json(response);
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('状态统计错误:', error);
        
        res.status(500).json({
            ok: false,
            error: '获取统计信息失败',
            timestamp: new Date().toISOString()
        });
    }
};
