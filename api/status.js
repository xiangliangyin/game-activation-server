const { db } = require('@vercel/postgres');
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        // 获取统计信息
        const stats = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_used THEN 1 ELSE 0 END) as used,
                SUM(CASE WHEN NOT is_used THEN 1 ELSE 0 END) as available
            FROM activation_codes
        `);
        return res.json({
            ok: true,
            database: 'connected',
            stats: {
                total: Number(stats.rows[0].total),
                used: Number(stats.rows[0].used || 0),
                available: Number(stats.rows[0].available || 0)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('状态检查错误:', error);
        return res.json({
            ok: false,
            database: 'disconnected',
            error: '数据库连接失败'
        });
    }
};
