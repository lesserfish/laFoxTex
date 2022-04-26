const express = require("express");
const redis = require("redis");
const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const yargs = require("yargs");
const path = require("path");
const morgan = require('morgan')
const storage = require("./Storage");
const uuid = require("uuid");
const bodyParser = require('body-parser');

// Get Variables

const argv = yargs.scriptName("lafoxServer.js")
    .usage(`node $0 [args]`)
    .options( {
        redisHost : {
            default: "localhost",
            describe: "Host in which to connect to Redis."
        },
        redisPort: {
            default: 6379,
            describe: "Port in which to connect to Redis." 
        },
        redisUsername: {
            default: "",
            describe: "Redis username."
        },
        redisPassword: {
            default: "",
            describe: "Redis password."
        },
        redisDatabase: {
            default: 0,
            describe: "Redis database."
        },
        lafoxHost: {
            default:"localhost",
            describe: "Host in which to serve the server."
        },
        lafoxPort: {
            default:3000,
            describe: "laFoxServer port."
        },
        limitWindow: {
            default: 15 * 60 * 1000,
            describe: "Request window limit in milliseconds."
        },
        limitMax: {
            default: 200,
            describe: "Maximum amount of requests per limitWindow."
        },
        limitStandardHeaders: {
            default: true,
            describe: "Return rate limit info in the `RateLimit-*` headers."
        },
        limitLegacyHeaders: {
            default: false,
            describe: "Disable the `X-RateLimit-*` headers"
        },
        htmlDirectory: {
            default: "public",
            describe: "Directory for static HTML pages."
        },
        morganString: {
            default: "tiny",
            describe: "Format string for morgan."
        },
        SQLHost: {
            default: "localhost",
            describe: "Host in which to connect to MySQL."
        },
        SQLPort: {
            default: 3306,
            describe: "Port in which to conenct to MySQL."
        },
        SQLUser: {
            default: "root",
            describe: "MySQL username."
        },
        SQLPass: {
            default: "",
            describe: "MySQL password."
        },
        SQLDB: {
            default: "",
            describe: "MySQL Database."
        },
        storagePath: {
            default: "/tmp",
            describe: "Path where to store files."
        },
        maxStorage: {
            default: 5000000,
            describe: "Maximum amount of images stored in the hard drive."
        },
        maxImageSize: {
            default: 10000,
            describe: "Maximum size of an image in bytes."
        },
        maxInputSize: {
            default: 1000,
            describe: "Maximum size of latex source code."
        },

    })
    .argv

// Initialize Express JS

const app = express();

// Initialize Redis

const redisURL = `redis://${argv.redisUsername.length > 0 ? argv.redisUsername : ""}${argv.redisPassword.length > 0 ? ":" + argv.redisPassword : ""}${argv.redisUsername.length > 0 ? "@" : ""}${argv.redisHost}:${argv.redisPort}`
const redisClient = redis.createClient({
    url: redisURL
});

redisClient.on('error', (err) => {console.log('Redis Client Error', err); return -1;});

async function ConnectToRedis(){
    console.log("Creating Redis Connection.");
    await redisClient.connect();
    redisClient.select(argv.redisDatabase);
    console.log("Redis initialized!")
}

ConnectToRedis();

// Initialize Express-rate-limt

const limiter = rateLimit({
    windowMS: argv.limitWindow,
    max: argv.limitMax,
    standardHeaders: argv.limitStandardHeaders,
    limitLegacyHeaders: argv.limitLegacyHeaders,
    message: "Too many requests. Please wait before sending another!",

    store: new RedisStore({
        sendCommand: (...params) => redisClient.sendCommand(params)
    })
})

app.use(limiter);
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Morgan

app.use(morgan(argv.morganString))

// Initialize Storage
const TEXOptions = {
    packages: argv.MathJaxPackages,
    CSS: argv.MathJaxCSSPath,
    fontcache: argv.MathJaxFontCache
}
const lafoxOptions = {
    sqlhost: argv.SQLHost,
    sqlport: argv.SQLPort,
    sqluser: argv.SQLUser,
    sqlpass: argv.SQLPass,
    sqldatabase: argv.SQLDB,
    
    redishost: argv.redisHost,
    redisport: argv.redisPort,
    redisuser: argv.redisUsername,
    redispass: argv.redisPassword,
    redisdb: argv.redisDatabase,

    storagepath: argv.storagePath,
    maxstorage: argv.maxStorage,
    maximagesize: argv.maxImageSize,
    maxinputsize: argv.maxInputPath,

    texOptions: TEXOptions
}

const lafoxStorage = storage.New(lafoxOptions);

// Routes
app.use(express.static(path.join(__dirname, argv.htmlDirectory)));

app.post('/create', async (req, res) => {
    
    var id = uuid.v4().toString()
    
    var src = req.body.texsrc;
    var optionsraw = req.body.options;

    var options;
    try {
        options = JSON.parse(optionsraw);
    }catch(ex) {
        options = {}
    }
    
    out = await lafoxStorage.GenerateImage(id, src, options);

    if(out.error) {
        res.status(out.code).send(out.error);
        return;
    }

    var response = {
        id: out.path,
        redirection: req.hostname + "/image/" + out.path
    }

    res.status(out.code).send(response);
})

app.get('/image/:ID', async (req, res) => {
    var out = await lafoxStorage.RetrieveImage(req.params.ID);
    if(out.error) {
        res.status(out.code).send(out.error);
        return;
    }
    res.status(out.code).sendFile(out.path);
})
// Start Listening

app.listen(argv.lafoxPort, argv.lafoxHost, async (err)=>{
    if(err) {
        console.error(err);
    } else {
        console.log(`Started listening on  ${argv.lafoxHost}:${argv.lafoxPort}`);
    }
})

