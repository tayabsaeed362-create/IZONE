import EmbeddedPostgres from 'embedded-postgres'
import path from 'path'
import fs from 'fs'

const dataDir = path.resolve(__dirname, '../.pgdata')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: 5432,
  user: 'postgres',
  password: 'password',
  persistent: true,
})

async function run() {
  console.log('Initializing embedded PostgreSQL cluster...')
  try {
    await pg.initialise()
  } catch (err: any) {
    console.log('PostgreSQL already initialized or note:', err.message)
  }

  console.log('Starting PostgreSQL server on port 5432...')
  await pg.start()

  try {
    await pg.createDatabase('izone_dev')
    console.log('Database izone_dev created successfully.')
  } catch (err: any) {
    console.log('Database izone_dev ready.')
  }

  console.log('PostgreSQL is actively running at postgresql://postgres:password@localhost:5432/izone_dev')
}

run().catch((err) => {
  console.error('Failed to run embedded PostgreSQL:', err)
  process.exit(1)
})
