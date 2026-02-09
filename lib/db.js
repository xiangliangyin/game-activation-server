// /lib/db.js
const { Pool } = require('@neondatabase/serverless');

console.log('🔧 初始化数据库连接池');

// Vercel 使用 POSTGRES_URL，本地开发可以使用 DATABASE_URL
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ 错误：未设置数据库连接字符串');
    console.error('请在 Vercel 项目设置中添加 POSTGRES_URL 环境变量');
}

// 创建连接池（Vercel 无服务器函数优化）
const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },  // Vercel Postgres 必须
    max: 2,                              // 无服务器环境建议1-2
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 3000
});

// 测试连接
if (connectionString) {
    pool.query('SELECT NOW() as time')
        .then(() => console.log('✅ 数据库连接成功'))
        .catch(err => console.error('❌ 数据库连接失败:', err.message));
}

module.exports = pool;
