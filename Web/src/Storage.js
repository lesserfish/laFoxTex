const mysql = require('mysql2');
const redis = require('redis')
const tex = require("./TEX.js")
const fs = require('fs')
const path = require("path");
const e = require('express');

class Storage {
    StorageConfig = {}
    SQLConfig = {}
    REDISConfig = {}

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
    ValidateOptions(inoptions) {
        var outoptions = {
            inline: false,
            em: 16,
            ex: 16,
            width: 80 * 6,
            resize: null,
            resizeWidth: null,
            resizeHeight: null
        }

        if(inoptions.inline) {
            outoptions.inline = true;
        }
        if(inoptions.em) {
            var em = parseInt(inoptions.em);
            if(!isNaN(em)){
                em = Math.min(em, 64);
                em = Math.max(em, 0);
                outoptions.em = em;
            }
        }
        if(inoptions.ex) {
            var ex = parseInt(inoptions.ex);
            if(!isNaN(ex)){
                ex = Math.min(ex, 64);
                ex = Math.max(ex, 0);
                outoptions.ex = ex;
            }
        }
        if(inoptions.width) {
            var width = parseInt(inoptions.width);
            if(!isNaN(width)){
                outoptions.width = width;
            }
        }
        if(inoptions.resize) {
            var resize = parseFloat(inoptions.resize);
            if(!isNaN(resize)){
                resize = Math.max(resize, 0);
                outoptions.resize = resize;
            }
        }
        if(inoptions.resizeWidth) {
            var resizeWidth = parseInt(inoptions.resizeWidth);
            if(!isNaN(resizeWidth)){
                resizeWidth = Math.max(resizeWidth, 0);
                outoptions.resizeWidth = resizeWidth;
            }
        }
        if(inoptions.resizeHeight) {
            var resizeHeight = parseInt(inoptions.resizeHeight);
            if(!isNaN(resizeHeight)){
                resizeHeight = Math.max(resizeHeight, 0);
                outoptions.resizeHeight = resizeHeight;
            }
        }

        console.log(outoptions)
        return outoptions;
    }
    async RetrieveImage(uuid) {
        // Check MySQL to see if image is on record
        var response = await this.SQLConnection.promise().query("SELECT * FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    code: 500,
                    error: "Internal error.",
                    path: ""
                }
            }
        })

        var uuidexists = response[0].length > 0;
        // If it isn't return error, else:
        if(!uuidexists){
            return {
                code: 400,
                error: "No information under that UUID.",
                path: ""
            }
        }

        // Check to see if image is on storage. If it is, return it's path. Else, 

        var status = response[0][0].status;
        
        if(status == "alive"){
            var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");
            var doublecheck = fs.existsSync(filepath)

            if(doublecheck) {
                return {
                    code: 200,
                    error: null,
                    path: filepath
                }
            } else {
                this.SQLConnection.execute("UPDATE requests SET status = 'dead' WHERE uuid = ?", [uuid], (err) => {
                    if(err){
                        console.log(err);
                        return {
                            code: 500,
                            error: "Internal error.",
                            path: ""
                        }
                    }
                })
            }
        }
        // Get tex_src from uuid, and generate the image again

        var texsrc = response[0][0].request;
        var rawoptions = response[0][0].options;

        var options;
        try {
            options = JSON.parse(rawoptions);
        } catch(ex){
            options = {}
        }

        var cleanoptions = this.ValidateOptions(options)
        
        var svg = tex.TexToSVG(texsrc, cleanoptions)
        var png = await tex.SVGToPng(svg, cleanoptions)

        if(!png) {
            return {
                code: 400,
                error: "Could not generate png.",
                path: ""}
        }

        await this.CreateFile(uuid, png);
        var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");
        
        await this.AddToStorage(uuid);
        
        this.SQLConnection.execute("UPDATE requests SET status = 'alive' WHERE uuid = ?", [uuid], (err) => {
            if(err) {
                console.log(err)
            }
        })
        
        // return the path of the new image
        return {
                code: 200,
                error: null,
                path: filepath}
    }

    async GenerateImage(uuid, texsrc, options) {
        
        if(texsrc.length > this.StorageConfig.maxinputsize) {
            return {
                code: 401,
                error: "Request too large",
                path: ""
            }
        }
        // Check MySQL to see if image is on record
        var response = await this.SQLConnection.promise().query("SELECT * FROM requests WHERE uuid = ?", [uuid], (err, results, fields) => {
            if(err){
                console.log(err);
                return {
                    code: 500,
                    error: "Internal error.",
                    path: ""
                }
            }
        })
        var uuidexists = response[0].length > 0;
        
        if(uuidexists) {
            return {
                code: 401,
                error: "UUID Exists",
                path: ""
            }
        }
        // Create Image using TEX

        var cleanoptions = this.ValidateOptions(options);

        var svg = tex.TexToSVG(texsrc, cleanoptions);
        var png = await tex.SVGToPng(svg, cleanoptions);
        
        if(!png){
            return {
                code: 400,
                error: "Could not generate png.",
                path: ""}
        }
        
        if(png.byteLength > this.StorageConfig.maximgsize){
            return {
                code: 401,
                error: "Image size too large",
                path: ""
            }
        }
        var imgpath = await this.CreateFile(uuid, png);
        // Add entry to MySQL
        
        var rawoptions = JSON.stringify(options)
        
        this.SQLConnection.execute("INSERT INTO requests (uuid, request, options, status) VALUES (?, ?, ?, 'alive')", [uuid, texsrc, rawoptions], (err) => {
            if(err){
                console.log(err);
            }
        })

        // Add image to storage

        await this.AddToStorage(uuid);

        // Return path of new image
        return {
                code: 200,
                error: null,
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
            
            this.SQLConnection.execute("UPDATE requests SET status = 'dead' WHERE uuid = ?", [olduuid], (err) => {
                if(err) {
                    console.log(err)
                }
            })
        }
    }
    async CreateFile(uuid, content) {
        var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");

        fs.writeFile(filepath, content, "binary", (err) => {
            if(err) {
                console.error(err);
            }
        });

        return uuid;

    }
    async RemoveFile(uuid) {
        var filepath = path.join(this.StorageConfig.storagepath, uuid + ".png");

        fs.unlink(filepath, (err) => {
            if(err) {
                console.log(err);
            }
        })
    }
}

var New = function(options){
    return new Storage(options);
}

module.exports = {New};