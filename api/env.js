// /api/env.js
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const envInfo = {
        timestamp: new Date().toISOString(),
        environment: {
            NODE_ENV: process.env.NODE_ENV || '未设置',
            VERCEL: process.env.VERCEL ? '是' : '否',
            POSTGRES_URL: process.env.POSTGRES_URL ? '✅ 已设置' : '❌ 未设置',
            DATABASE_URL: process.env.DATABASE_URL ? '✅ 已设置' : '❌ 未设置'
        },
        endpoints: {
            health: '/api/health',
            status: '/api/status',
            activate: '/api/activate',
            env: '/api/env'
        }
    };
    
    res.status(200).json(envInfo);
};
