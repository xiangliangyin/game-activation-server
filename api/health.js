const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const health = {
        status: 'checking',
        timestamp: new Date().toISOString(),
        service: 'activation-api',
        version: '2.0.0-pool'
    };
    
    const client = await pool.connect();
    
    try {
        // 测试数据库
        const dbResult = await client.query('SELECT 1 as test, version() as version');
        
        health.status = 'healthy';
        health.database = {
            connected: true,
            neon: true,
            test: dbResult.rows[0].test === 1,
            version: dbResult.rows[0].version,
            pool_status: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            }
        };
        
        res.status(200).json(health);
        
    } catch (error) {
        health.status = 'unhealthy';
        health.database = {
            connected: false,
            error: error.message
        };
        
        res.status(503).json(health);
    } finally {
        client.release();
    }
};
