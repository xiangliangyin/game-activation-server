// /api/health.js
const pool = require('../lib/db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const client = await pool.connect();
        
        try {
            const result = await client.query('SELECT NOW() as time, version() as version');
            
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                database: {
                    connected: true,
                    time: result.rows[0].time,
                    version: result.rows[0].version
                }
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
};
