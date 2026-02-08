// /lib/db.js - 统一的数据库连接池
const { Pool } = require('@neondatabase/serverless');

// 详细的日志输出
console.log('📊 数据库连接初始化:');
console.log('- 环境变量 POSTGRES_URL:', process.env.POSTGRES_URL ? '✅ 已设置' : '❌ 未设置');
console.log('- 环境变量 DATABASE_URL:', process.env.DATABASE_URL ? '✅ 已设置' : '❌ 未设置');

// 优先使用 POSTGRES_URL，这是 Vercel 的标准
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ 致命错误：未找到数据库连接字符串！');
    console.error('请在 Vercel 项目设置中设置环境变量：');
    console.error('1. 进入 Vercel Dashboard → 项目 → Settings → Environment Variables');
    console.error('2. 添加 POSTGRES_URL 或 DATABASE_URL');
    console.error('3. 值为：postgresql://username:password@host.neon.tech/dbname?sslmode=require');
}

// 创建连接池
const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false  // Vercel Postgres 必须使用 SSL
    },
    max: 2,                        // Vercel 无服务器环境建议 1-2 个连接
    idleTimeoutMillis: 10000,      // 10秒空闲后释放连接
    connectionTimeoutMillis: 3000, // 3秒连接超时
});

// 连接池事件监听
pool.on('connect', () => {
    console.log('✅ 数据库连接成功');
});

pool.on('error', (err) => {
    console.error('❌ 数据库连接错误:', err.message);
});

pool.on('remove', () => {
    console.log('🔌 数据库连接被移除');
});

// 测试连接（可选）
if (connectionString) {
    pool.query('SELECT 1')
        .then(() => console.log('✅ 数据库连接测试通过'))
        .catch(err => console.error('❌ 数据库连接测试失败:', err.message));
}

module.exports = pool;
