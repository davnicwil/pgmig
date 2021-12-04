# pgmig

A really simple migration tool for node / postgres

- define migrations in SQL files
- 1 file = 1 migration
- you choose the migration files directory. Defaults to `migrations`.
- migrations run in alphabetical filename order. Simplest scheme is `0001.sql, 0002.sql, 0003.sql` etc.
- the content of a migration can't be changed after is has run
- migrations are tracked in the database in a table you choose. Defaults to `_migrations`.
- run migrations using a JS function on server start
- locking is handled for you. If you start multiple server instances only one set of migrations will run.
- if a set of new migrations runs, any error in any of the migrations will roll the entire set of changes back

A couple of notable things not included

- no mechanism for rollback/down migrations
- no CLI - you create migrations yourself (they are just SQL files) and run them via JS

### Usage

`pgmig` ships with typescript types (it is in fact written in TS) so you can see this in your editor, but just for a quick bit of documentation here is the signature of the single function the library exports to run your migrations:

```
import pgmig from 'pgmig'
import pg from 'pg' // import your own version of pg (more on this below)

pgmig.run(
  pg, // pass in your own version of pg (more on this below)

  options: {
    // your database connection options
    user: string
    host: string
    database: string
    password: string
    port: number

    // choose your own directory name for migrations and migrations table
    // if you don't like the defaults
    migrationsDirectory: string [default 'migrations']
    migrationsTable?: string [default '_migrations']

    // a logger if you want to plug log output from running migrations into your logging solution of choice
    // defaults to just do nothing
    log: (level: 'error' | 'debug' | 'info', message: string)
  },
```

### `pg` dependency

`pgmig` uses the `pg` lib to talk to postgres, but doesn't have it as a peer dependency.

You just import it yourself and pass it into the `run` function. This is to offer maximum flexibility to use any version of `pg`, or any API compatible library, that you want.

It only uses the most basic APIs, so I think it will likely work with every past and future version.

### Node version

`pgmig` is compiled to work with Node 14 and above.

This is set in the `target` of `tsconfig.json`. If you need support for an older version, fork and change that!

### Logging

Logging is abstracted away with a function you pass to `run` so that you can use any logger you want. It defaults to log nothing.

The log function gives you a level (`debug`, `info` or `error`), and a message.

So for example, just using `console.log` you could do `(level, message) => console.log(level + ': ' + message)`
