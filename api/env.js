// /api/env.js - 环境变量检查接口（调试用）
module.exports = async (req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 只允许 GET 请求
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只支持 GET 请求' });
    }
    
    // 安全地显示环境变量（隐藏敏感信息）
    const envInfo = {
        timestamp: new Date().toISOString(),
        environment_variables: {
            NODE_ENV: process.env.NODE_ENV || '未设置',
            POSTGRES_URL: process.env.POSTGRES_URL 
                ? '✅ 已设置 (' + process.env.POSTGRES_URL.substring(0, 20) + '...)' 
                : '❌ 未设置',
            DATABASE_URL: process.env.DATABASE_URL 
                ? '✅ 已设置 (' + process.env.DATABASE_URL.substring(0, 20) + '...)' 
                : '❌ 未设置',
        },
        system: {
            node_version: process.version,
            platform: process.platform,
            architecture: process.arch,
            memory_usage: {
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB'
            }
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
