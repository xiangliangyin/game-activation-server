const { Pool } = require('@neondatabase/serverless');

// 使用连接池
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
});

module.exports = async (req, res) => {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 只允许GET请求
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只支持GET请求' });
    }
    
    const client = await pool.connect();
    
    try {
        // 1. 获取基本统计
        const statsResult = await client.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_used THEN 1 ELSE 0 END) as used,
                SUM(CASE WHEN NOT is_used THEN 1 ELSE 0 END) as available,
                COUNT(DISTINCT used_by) as unique_users,
                MIN(created_at) as first_created,
                MAX(used_at) as last_used
            FROM activation_codes
        `);
        
        const stats = statsResult.rows[0];
        
        // 2. 获取今日激活统计
        const todayResult = await client.query(`
            SELECT 
                COUNT(*) as today_used,
                COUNT(DISTINCT used_by) as today_users
            FROM activation_codes 
            WHERE used_at >= CURRENT_DATE
        `);
        
        // 3. 获取最近激活记录
        const recentResult = await client.query(`
            SELECT 
                code, 
                used_by, 
                used_at,
                EXTRACT(HOUR FROM used_at) as hour
            FROM activation_codes 
            WHERE used_at IS NOT NULL 
            ORDER BY used_at DESC 
            LIMIT 10
        `);
        
        // 4. 获取使用最多的用户
        const topUsersResult = await client.query(`
            SELECT 
                used_by,
                COUNT(*) as usage_count
            FROM activation_codes 
            WHERE used_by IS NOT NULL 
              AND used_by != 'anonymous'
            GROUP BY used_by 
            ORDER BY usage_count DESC 
            LIMIT 5
        `);
        
        // 构建响应数据
        const response = {
            ok: true,
            system: {
                service: 'activation-api',
                version: '2.0.0',
                environment: process.env.NODE_ENV || 'production',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            },
            stats: {
                // 总数统计
                total: Number(stats.total) || 0,
                used: Number(stats.used) || 0,
                available: Number(stats.available) || 0,
                usage_rate: stats.total > 0 
                    ? ((Number(stats.used) / Number(stats.total)) * 100).toFixed(1) + '%'
                    : '0%',
                
                // 用户统计
                unique_users: Number(stats.unique_users) || 0,
                
                // 时间统计
                first_created: stats.first_created,
                last_used: stats.last_used,
                
                // 今日统计
                today_used: Number(todayResult.rows[0].today_used) || 0,
                today_users: Number(todayResult.rows[0].today_users) || 0
            },
            recent_activations: recentResult.rows.map(row => ({
                code: row.code,
                used_by: row.used_by || '匿名用户',
                used_at: row.used_at,
                time: row.used_at ? new Date(row.used_at).toLocaleTimeString() : null
            })),
            top_users: topUsersResult.rows.map(row => ({
                user: row.used_by,
                count: Number(row.usage_count)
            })),
            database: {
                connected: true,
                pool_size: pool.totalCount,
                idle_connections: pool.idleCount
            }
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('统计API错误:', error);
        
        res.status(500).json({
            ok: false,
            error: '获取统计信息失败',
            detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
        
    } finally {
        client.release();
    }
};
