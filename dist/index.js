"use strict";Object.defineProperty(exports,"__esModule",{value:true});exports.run=void 0;const fs=require("fs");const path=require("path");const crypto=require("crypto");const sortAlphabetically=list=>{list.sort();return list};const getAllMigrationFilenames=migrationsDir=>{return sortAlphabetically(fs.readdirSync(migrationsDir))};const readMigrationFileContent=(migrationsDir,filename,log)=>{try{return fs.readFileSync(path.join(migrationsDir,filename)).toString()}catch(err){log("error",`pgmig: cannot read migration file [${filename}]`);throw err}};function getHash(filename,fileContent){return crypto.createHash("md5").update(filename+fileContent).digest("hex")}async function run(pg,{user,host,database,password,port,migrationsDirectory="migrations",migrationsTable="_migrations",log=()=>{}}){const client=new pg.Client({user:user,host:host,database:database,password:password,port:port});client.connect();await client.query(`create table if not exists ${migrationsTable} (number int NOT NULL, filename text NOT NULL, hash text NOT NULL, completed timestamp with time zone NOT NULL, duration bigint NOT NULL)`);try{await client.query("BEGIN");log("debug",`pgmig: acquiring table lock on ${migrationsTable} table`);await client.query(`lock table ${migrationsTable}`);log("debug",`pgmig: acquired table lock on ${migrationsTable} table`);const allMigrationFilenames=getAllMigrationFilenames(migrationsDirectory);log("debug",`pgmig: ${allMigrationFilenames.length} migration files found in ${migrationsDirectory} directory`);const appliedMigrations=await client.query(`select * from ${migrationsTable}`);log("debug",`pgmig: ${appliedMigrations.rows.length} applied migrations found in ${migrationsTable} table`);appliedMigrations.rows.forEach(appliedMigration=>{log("debug",`pgmig: verifying migration [${appliedMigration.filename}] content hash: ${appliedMigration.hash}`);const migrationFileContent=readMigrationFileContent(migrationsDirectory,appliedMigration.filename,log);const hash=getHash(appliedMigration.filename,migrationFileContent);if(appliedMigration.hash.toLowerCase()==="skip"){log("debug",`pgmig: skipping verification for migration [${appliedMigration.filename}] because hash is set to 'skip'`);return}if(hash!==appliedMigration.hash){const errMessage=`failed verification for migration [${appliedMigration.filename}] - current file content hash [${hash}] is different from the file content hash [${appliedMigration.hash}] at the time the migration was run, meaning the file content has changed`;log("error",`pgmig: ${errMessage}`);throw Error(errMessage)}else{log("debug",`pgmig: verified migration [${appliedMigration.filename}]`)}});const unappliedMigrationFilenames=[];allMigrationFilenames.forEach(filename=>{const applied=!!appliedMigrations.rows.find(appliedMigration=>{return filename===appliedMigration.filename});if(!applied){unappliedMigrationFilenames.push(filename)}});log("debug",`pgmig: ${unappliedMigrationFilenames.length} unapplied migrations found`);if(unappliedMigrationFilenames.length===0){let noMigrationsMessage=`No pending migrations to apply`;if(appliedMigrations.rows.length>0){noMigrationsMessage+=` - latest migration [${appliedMigrations.rows[appliedMigrations.rows.length-1].filename}]`}log("debug",`pgmig: ${noMigrationsMessage}`)}for(let filename of unappliedMigrationFilenames){try{const fileContent=readMigrationFileContent(migrationsDirectory,filename,log);const started=Date.now();await client.query(fileContent);const duration=Date.now()-started;await client.query(`insert into ${migrationsTable} (number, filename, hash, duration, completed) values ($1, $2, $3, $4, (SELECT (now() at time zone 'utc')))`,[appliedMigrations.rows.length+1,filename,duration,getHash(filename,fileContent)]);log("debug",`pgmig: applied migration [${filename}]`)}catch(err){log("debug",`pgmig: error applying migration [${filename}]`);throw err}}await client.query("COMMIT")}catch(err){await client.query("ROLLBACK");throw err}finally{client.end()}}exports.run=run;