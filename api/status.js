const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const client = await pool.connect();
    
    try {
        // 获取统计信息
        const stats = await client.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_used THEN 1 ELSE 0 END) as used,
                SUM(CASE WHEN NOT is_used THEN 1 ELSE 0 END) as available,
                COUNT(DISTINCT used_by) as unique_users,
                MIN(created_at) as first_created,
                MAX(used_at) as last_used
            FROM activation_codes
        `);
        
        // 获取最近激活记录
        const recent = await client.query(`
            SELECT code, used_by, used_at 
            FROM activation_codes 
            WHERE used_at IS NOT NULL 
            ORDER BY used_at DESC 
            LIMIT 10
        `);
        
        // 获取使用最多的用户
        const topUsers = await client.query(`
            SELECT used_by, COUNT(*) as usage_count
            FROM activation_codes 
            WHERE used_by IS NOT NULL AND used_by != 'anonymous'
            GROUP BY used_by 
            ORDER BY usage_count DESC 
            LIMIT 10
        `);
        
        res.json({
            ok: true,
            stats: {
                total: parseInt(stats.rows[0].total),
                used: parseInt(stats.rows[0].used || 0),
                available: parseInt(stats.rows[0].available || 0),
                usage_rate: ((parseInt(stats.rows[0].used || 0) / parseInt(stats.rows[0].total)) * 100).toFixed(2) + '%',
                unique_users: parseInt(stats.rows[0].unique_users || 0),
                first_created: stats.rows[0].first_created,
                last_used: stats.rows[0].last_used
            },
            recent_activations: recent.rows,
            top_users: topUsers.rows,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('统计查询错误:', error);
        res.status(500).json({ ok: false, error: '查询失败' });
    } finally {
        client.release();
    }
};
