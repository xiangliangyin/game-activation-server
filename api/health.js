// api/health.js
const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'activation-api',
        version: '1.0.0'
    };
    
    // 测试数据库连接
    try {
        const sql = neon(process.env.DATABASE_URL);
        const client = await sql();
        
        // 简单查询测试数据库
        const dbResult = await client.query('SELECT 1 as test');
        await client.end();
        
        health.database = 'connected';
        health.database_test = dbResult.rows[0].test === 1;
        
    } catch (error) {
        health.database = 'error';
        health.database_error = error.message;
        health.status = 'degraded';
    }
    
    // 返回健康状态
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
};
