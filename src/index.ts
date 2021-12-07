import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const sortAlphabetically = (list: string[]) => {
  list.sort()

  return list
}

const getAllMigrationFilenames = (migrationsDir: string): string[] => {
  return sortAlphabetically(fs.readdirSync(migrationsDir))
}

const readMigrationFileContent = (
  migrationsDir: string,
  filename: string,
  log: Logger,
) => {
  try {
    return fs.readFileSync(path.join(migrationsDir, filename)).toString()
  } catch (err: any) {
    log('error', `pgmig: cannot read migration file [${filename}]`)

    throw err
  }
}

function getHash(filename: string, fileContent: string) {
  return crypto
    .createHash('md5')
    .update(filename + fileContent)
    .digest('hex')
}

type Migration = {
  filename: string
  hash: string
  completed: boolean
}

type Logger = (level: string, message: string) => void

export async function run(
  pg: any,
  {
    user,
    host,
    database,
    password,
    port,

    migrationsDirectory,
    migrationsTable = '_migrations',

    log = () => {},
  }: {
    user: string
    host: string
    database: string
    password: string
    port: number

    migrationsDirectory: string
    migrationsTable?: string

    log: Logger
  },
) {
  const client = new pg.Client({
    user,
    host,
    database,
    password,
    port,
  })

  client.connect()

  // create migrations table if it doesn't already exist
  await client.query(
    `create table if not exists ${migrationsTable} (number int PRIMARY KEY NOT NULL, filename text NOT NULL, hash text NOT NULL, completed timestamp with time zone NOT NULL, duration bigint NOT NULL)`,
  )

  // wrap all transactions to be run in a single transaction
  //
  // if any of them fail, no changes are committed
  try {
    await client.query('BEGIN')

    // before proceeding, try to aquire a postgres table lock on the migrations table
    //
    // this is useful when deploying many instances of an app simultaneously - if several processes
    // attempt to run migrations at the same time only one will get the lock and the rest will have to wait,
    // by which time all migrations will have been applied
    log('debug', `pgmig: acquiring table lock on ${migrationsTable} table`)
    await client.query(`lock table ${migrationsTable}`)
    log('debug', `pgmig: acquired table lock on ${migrationsTable} table`)

    const allMigrationFilenames = getAllMigrationFilenames(migrationsDirectory)
    log(
      'debug',
      `pgmig: ${allMigrationFilenames.length} migration files found in ${migrationsDirectory} directory`,
    )
    const appliedMigrations: { rows: Migration[] } = await client.query(
      `select * from ${migrationsTable}`,
    )
    log(
      'debug',
      `pgmig: ${appliedMigrations.rows.length} applied migrations found in ${migrationsTable} table`,
    )

    // check all hashes match for applied migrations before continuing
    appliedMigrations.rows.forEach((appliedMigration) => {
      log(
        'debug',
        `pgmig: verifying migration [${appliedMigration.filename}] content hash: ${appliedMigration.hash}`,
      )

      const migrationFileContent = readMigrationFileContent(
        migrationsDirectory,
        appliedMigration.filename,
        log,
      )
      const hash = getHash(appliedMigration.filename, migrationFileContent)

      // allow check to be manually skipped by setting hash value to 'skip' in database
      if (appliedMigration.hash.toLowerCase() === 'skip') {
        log(
          'debug',
          `pgmig: skipping verification for migration [${appliedMigration.filename}] because hash is set to 'skip'`,
        )

        return
      }

      if (hash !== appliedMigration.hash) {
        const errMessage = `failed verification for migration [${appliedMigration.filename}] - current file content hash [${hash}] is different from the file content hash [${appliedMigration.hash}] at the time the migration was run, meaning the file content has changed`
        log('error', `pgmig: ${errMessage}`)
        throw Error(errMessage)
      } else {
        log('debug', `pgmig: verified migration [${appliedMigration.filename}]`)
      }
    })

    // get unapplied migrations
    const unappliedMigrationFilenames: string[] = []
    allMigrationFilenames.forEach((filename) => {
      const applied = !!appliedMigrations.rows.find((appliedMigration) => {
        return filename === appliedMigration.filename
      })

      if (!applied) {
        unappliedMigrationFilenames.push(filename)
      }
    })
    log(
      'debug',
      `pgmig: ${unappliedMigrationFilenames.length} unapplied migrations found`,
    )

    if (unappliedMigrationFilenames.length === 0) {
      let noMigrationsMessage = `No pending migrations to apply`

      if (appliedMigrations.rows.length > 0) {
        noMigrationsMessage += ` - latest migration [${appliedMigrations.rows[appliedMigrations.rows.length - 1].filename}]` // prettier-ignore
      }

      log('debug', `pgmig: ${noMigrationsMessage}`)
    }

    for (let filename of unappliedMigrationFilenames) {
      try {
        const fileContent = readMigrationFileContent(
          migrationsDirectory,
          filename,
          log,
        )
        const started = Date.now()
        await client.query(fileContent)
        const duration = Date.now() - started
        await client.query(
          `insert into ${migrationsTable} (number, filename, hash, duration, completed) values ($1, $2, $3, $4, (SELECT (now() at time zone 'utc')))`,
          [
            appliedMigrations.rows.length + 1,
            filename,
            getHash(filename, fileContent),
            duration,
          ],
        )

        log('debug', `pgmig: applied migration [${filename}]`)
      } catch (err: any) {
        log('debug', `pgmig: error applying migration [${filename}]`)

        throw err
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')

    throw err
  } finally {
    client.end()
  }
}
