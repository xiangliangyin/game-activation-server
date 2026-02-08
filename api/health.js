// /api/health.js - 健康检查接口
const pool = require('../lib/db');

module.exports = async (req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log(`[${new Date().toISOString()}] 健康检查请求: ${req.method} ${req.url}`);
    
    const health = {
        status: 'checking',
        timestamp: new Date().toISOString(),
        service: 'activation-api',
        environment: process.env.NODE_ENV || 'production'
    };
    
    try {
        // 测试数据库连接
        const client = await pool.connect();
        
        try {
            const dbResult = await client.query('SELECT version() as version, NOW() as now');
            
            health.status = 'healthy';
            health.database = {
                connected: true,
                version: dbResult.rows[0].version,
                current_time: dbResult.rows[0].now,
                pool_status: {
                    total: pool.totalCount,
                    idle: pool.idleCount,
                    waiting: pool.waitingCount
                }
            };
            
            console.log('✅ 健康检查通过');
            res.status(200).json(health);
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        health.status = 'unhealthy';
        health.database = {
            connected: false,
            error: error.message
        };
        
        console.error('❌ 健康检查失败:', error.message);
        res.status(503).json(health);
    }
};
