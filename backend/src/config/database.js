/**
 * Database Configuration
 * LinkedEye-FinSpot
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  errorFormat: 'pretty'
});

// Connection test with retry logic
async function connectDatabase() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 5000; // 5 seconds
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const dbUrl = process.env.DATABASE_URL || '';
      // Mask password in logs
      const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
      console.log(`Check Database connection to: ${maskedUrl}`);

      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return true;
    } catch (error) {
      retries++;
      console.error(`❌ Database connection failed (Attempt ${retries}/${MAX_RETRIES}):`, error.message);

      if (retries >= MAX_RETRIES) {
        console.error('Max retries reached. Exiting...');
        // Don't exit process here, let server handle it or crash
        return false;
      }

      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

// Graceful disconnect
async function disconnectDatabase() {
  await prisma.$disconnect();
  console.log('Database disconnected');
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase
};
