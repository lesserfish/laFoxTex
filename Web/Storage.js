const mysql = require('mysql2');
const redis = require('redis')
const tex = require("./TEX.js")
const fs = require('fs')
const path = require("path");
const { ConnectionTimeoutError } = require('redis');

class Storage {
    StorageConfig = {}
    SQLConfig = {}
    REDISConfig = {}
    TEXConfig = {}

    constructor(options){
        // SQL
        this.SQLConfig["host"] = options.sqlhost;
        this.SQLConfig["port"] = options.sqlport;
        this.SQLConfig["user"] = options.sqluser;
        this.SQLConfig["pass"] = options.sqlpass;
        this.SQLConfig["database"] = options.sqldatabase;

        // REDIS

        this.REDISConfig["host"] = options.redishost;
        this.REDISConfig["port"] = options.redisport;
        this.REDISConfig["user"] = options.redisuser;
        this.REDISConfig["pass"] = options.redispass;
        this.REDISConfig["database"] = options.redisdb;
        
        // Storage

        this.StorageConfig["storagepath"] = options.storagepath;
        this.StorageConfig["maxstorage"] = options.maxstorage;
        this.StorageConfig["maximgsize"] = options.maximagesize;
        this.StorageConfig["maxinputsize"] = options.maxinputsize;

        // TEX

        this.TEXConfig = options.texOptions;

        this.Initialize()
    }
    async Initialize(){
        // SQL

        this.SQLConnection = mysql.createConnection({
            host: this.SQLConfig.host,
            port: this.SQLConfig.port,
            user: this.SQLConfig.user,
            password: this.SQLConfig.pass,
            database: this.SQLConfig.database
        })

        this.SQLConnection.connect()
        
        this.SetupSQL();
        
        // REDIS

        var redisURL = `redis://${this.REDISConfig.user.length > 0 ? this.REDISConfig.user : ""}${this.REDISConfig.pass.length > 0 ? ":" + this.REDISConfig.pass : ""}${this.REDISConfig.user.length > 0 ? "@" : ""}${this.REDISConfig.host}:${this.REDISConfig.port}`
        this.redisClient = redis.createClient({
                url : redisURL,
        });        
        this.redisClient.on('error', (err) => {console.log('Redis Client Error', err); return -1;});

        await this.redisClient.connect()
        this.redisClient.select(this.REDISConfig.database);

        this.SetupRedis();

        // Tex


    }
    SetupSQL(){
        // Create tables
        this.SQLConnection.execute("CREATE TABLE IF NOT EXISTS requests (uuid CHAR(36) UNIQUE PRIMARY KEY, request TEXT, options TEXT, status TEXT, date DATE default(CURRENT_DATE));")
    }
    SetupRedis(){
        this.redisClient.DEL("storage");
    }

    // API

    async RetrieveImage(uuid) {
        // Check MySQL to see if image is on record
        var response = await this.SQLConnection.promise().query("SELECT * FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    error: "Internal error.",
                    path: ""
                }
            }
        })

        var uuidexists = response[0].length > 0;
        // If it isn't return error, else:

        if(!uuidexists){
            return {
                error: "No information under that UUID.",
                path: ""
            }
        }

        // Check to see if image is on storage. If it is, return it's path. Else, 

        var statuspromise = await this.SQLConnection.promise().query("SELECT status FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    error: "Internal error.",
                    path: ""
                }
            }
        })

        var status = statuspromise[0][0].status;

        if(status == "alive"){
            var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");
            var doublecheck = fs.existsSync(filepath)

            if(doublecheck) {
                return {
                    error: null,
                    path: filepath
                }
            } else {
                this.SQLConnection.execute("UPDATE requests SET status = 'dead' WHERE uuid = ?", [uuid], (err) => {
                    if(err){
                        console.log(err);
                        return {
                            error: "Internal error.",
                            path: ""
                        }
                    }
                })
            }
        }
        // Get tex_src from uuid, and generate the image again

        var srcpromise = await this.SQLConnection.promise().query("SELECT request, options FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    error: "Internal error.",
                    path: ""
                }
            }
        })

        var texsrc = srcpromise[0][0].request;
        var rawoptions = srcpromise[0][0].options;
        var options;
        try {
            options = JSON.parse(rawoptions);
        } catch(ex){
            return {
                error: "Invalid image parameters.",
                path: ""
            }
        }

        var svg = tex.TexToSVG(texsrc, {
            inline: options.inline == undefined ? true : false,
            em: options.em == undefined ? options.em : 16,
            ex: options.ex == undefined ? options.ex : 16,
            width: options.width == undefined ? options.width : 80 * 60
        })
        
        var png = await tex.SVGToPng(svg, {
            resize: options.resize,
            resizeWidth: options.resideWidth,
            resizeHeight: options.resizeHeight
        })

        imgpath = await this.AddFile(uuid, png);
        
        this.SQLConnection.execute("UPDATE requests SET status = 'alive' WHERE uuid = ?", [uuid], (err) => {
            if(err) {
                console.log(err)
            }
        })

        // return the path of the new image
        return {error: null,
                path: imgpath}
    }

    async GenerateImage(uuid, texsrc, options) {
        
        // Check MySQL to see if image is on record
        var response = await this.SQLConnection.promise().query("SELECT * FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    error: "Internal error.",
                    path: ""
                }
            }
        })
        var uuidexists = response[0].length > 0;
        
        if(uuidexists) {
            return {
                error: "UUID Exists",
                path: ""
            }
        }
        // Create Image using TEX

        var svg = tex.TexToSVG(texsrc, {
            inline: options.inline == undefined ? true : false,
            em: options.em != undefined ? options.em : 16,
            ex: options.ex != undefined ? options.ex : 16,
            width: options.width != undefined ? options.width : 80 * 60
        })
        
        var png = await tex.SVGToPng(svg, {
            resize: options.resize,
            resizeWidth: options.resideWidth,
            resizeHeight: options.resizeHeight
        })
        
        var imgpath = await this.AddFile(uuid, png);
        // Add entry to MySQL
        
        var rawoptions = JSON.stringify(options)
        
        this.SQLConnection.execute("INSERT INTO requests (uuid, request, options, status) VALUES (?, ?, ?, 'alive')", [uuid, texsrc, rawoptions], (err) => {
            if(err){
                console.log(err);
            }
        })

        // Add image to storage

        this.AddToStorage(uuid);

                // Return path of new image
        return {error: null,
                path: imgpath}
    }

    async AddToStorage(uuid) {
        // RPUSH new image to Redis
        this.redisClient.RPUSH("storage", uuid);

        // LPUSH old image from Redis

        var currentsize = await this.redisClient.LLEN("storage");

        // Delete old image from File
        
        if(currentsize > this.StorageConfig.maxstorage) {
            var olduuid = await this.redisClient.LPOP("storage");
            this.RemoveFile(olduuid);
            
            // Update MySQL Status

            this.SQLConnection.execute("UPDATE requests SET status = 'dead' WHERE uuid = ?", [uuid], (err) => {
                if(err) {
                    console.log(err)
                }
            })
        }
    }
    async AddFile(uuid, content) {
        var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");

        fs.writeFile(filepath, content, "binary", (err) => {
            console.error(err);
        });

        return uuid;

    }
    async RemoveFile(uuid) {
        var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");

        fs.unlink(filepath)
    }
}

var New = function(options){
    return new Storage(options);
}

module.exports = {New};