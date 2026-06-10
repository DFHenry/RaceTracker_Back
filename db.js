import mongoose, { mongo } from "mongoose";
import {MongoClient, ObjectId} from "mongodb";
import { scryptSync } from "crypto";

//get uri from .env file
const dbUrl = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPWD}@${process.env.DBHOST}/${process.env.DB_NAME}`;

//  +++ USER ACCOUNT DATA +++

//get mongoDB collections
const userDb = new MongoClient(dbUrl).db("users");
const vehicleDb = new MongoClient(dbUrl).db("vehicles");
const maintenanceDb = new MongoClient(dbUrl).db("maintenancelogs");
const raceDb = new MongoClient(dbUrl).db("raceInfo");
const raceRecordDb = new MongoClient(dbUrl).db("raceRecords");
const lapHistoryDB = new MongoClient(dbUrl).db("lapHistory");

//user schema
const UserSchema = new mongoose.Schema(
{
    username: String,
    password: String
});

//user object
const User = mongoose.model("User", UserSchema);

//  +++ VEHICLE REGISTRY DATA +++

//vehicle schema
const VechicleSchema = new mongoose.Schema(
{
    vehicleNumber: Number,
    tagHex: String,
    status: String
});

//vehicle object
const Vehicle = mongoose.model("Vehicle", VechicleSchema);

//maintenance log schema
const MaintenanceSchema = new mongoose.Schema(
{
    vehicleNumber: Number,
    description: String,
    dateStarted: Date,
    dateFinished: Date,
    repairedBy: String,
    status: String
});

//maintenance log model
const MaintenanceLog = mongoose.model("MaintenanceLog", MaintenanceSchema);

//  +++ RACE DATA +++

//racer schema
const RacerSchema = new mongoose.Schema(
{
    racerName: String,
    racerEmail: String,
    vehicleNumber: Number,
    vehicleRFID: String
});

//racer model
const Racer = mongoose.model("Racer", RacerSchema);

//race management schema
const RaceSchema = new mongoose.Schema(
{
    raceState: String,
    racers: [RacerSchema],
    noOfLaps: Number
});

//race model
const Race = mongoose.model("Race", RaceSchema);

//lapRecord schema for RaceRecord.lapRecords array
const lapRecord = new mongoose.Schema(
{
    lapNumber: Number,
    lapTime: String,
    singleLapTime: String,
    polePosition: String,
    raceVehicle: Number,
    racerName: String,
    vehicleRFID: String,
    dateMade: String
});

//raceRecord schema
const RaceRecordSchema = new mongoose.Schema(
{
    raceDateTime: Date,
    finaPositions: [String],
    lapRecords: [lapRecord],
    noOfLaps: Number,
    racers: []
});

//raceRecord model
const RaceRecord = mongoose.model("RaceRecord", RaceRecordSchema);

//  +++ LAP HISTORY DATA +++

//lapHistory schema
const lapHistorySchema = new mongoose.Schema(
{
    periodType: Number,
    periodString: String,
    periodDate: String,
    recordArray: [lapRecord]
});

//lapHistory model
const lapHistory = mongoose.model("LapHistory", lapHistorySchema);

//  +++ DB CONNECTION +++

//connect to the db
await mongoose.connect(dbUrl);

//  +++ LOGIN METHODS +++

//authenticate username and password
async function authenticateUser(username, password)
{
    let key = scryptSync(password, process.env.SALT, 64);
    let result = await User.findOne(
    {
        username: username,
        password: key.toString("base64")
    });
    return (result) ? true : false;
}

//find all users
async function getUsers()
{
    return await User.find({});    
}

//add a user to the DB
async function addUser(newUser) 
{
    let key = scryptSync(newUser.password, process.env.SALT, 64);
    let userToAdd = new User(
    {
        username: newUser.username,
        password: key.toString("base64")
    });   
    let status = await User.insertOne(userToAdd);
}

// +++ VEHICLE REGISTRY METHODS +++

//get all vehicles
async function getAllVehicles()
{
    return await Vehicle.find({});
}

//add vehicle to registry
async function addVehicle(newVehicle)
{
    let vehicleToAdd = new Vehicle(
    {
        vehicleNumber: newVehicle.vehicleNumber,
        tagHex: newVehicle.tagHex,
        status: newVehicle.status
    });
    let result = await Vehicle.insertOne(vehicleToAdd);
}

//view a specific vehicle in the registry
async function getOneVehicle(id)
{
    const viewId = { _id: new ObjectId(String(id)) }; 
    const result = Vehicle.findOne(viewId);
    return result;    
}

//edit vehicle's data
async function editVehicle(filter, vehicleDoc)
{
    let vehicleToEdit = 
    {
        vehicleNumber: vehicleDoc.vehicleNumber,
        tagHex: vehicleDoc.tagHex,
        status: vehicleDoc.status
    }

    await Vehicle.updateOne(filter, vehicleToEdit);
    // return result;
}

async function deleteVehicle(id)
{
    let vehicleToRemove = {_id: new ObjectId(String(id)) };

    await Vehicle.deleteOne(vehicleToRemove);
}

//get all relevant vehicle logs
async function getAllLogs(vehicleNo)
{
    let logs = await MaintenanceLog.find({});

    var relevantLogs = [];

    for(let i = 0; i < logs.length; i++)
    {
        if(logs[i].vehicleNumber == vehicleNo)
        {
            relevantLogs.push(logs[i]);
        }
    }
    return relevantLogs;
}

//add a maintenance log
async function addMaintenanceLog(newLog)
{
    let logToAdd = new MaintenanceLog(
    {
        vehicleNumber: newLog.vehicleNumber,
        description: newLog.description,
        dateStarted: newLog.dateStarted,
        dateFinished: newLog.dateFinished,
        repairedBy: newLog.repairedBy
    });

    let result = await MaintenanceLog.insertOne(logToAdd);
}

async function deleteLogs(vehicleNo) 
{
    let logs = await MaintenanceLog.find({});

    for(let i = 0; i < logs.length; i++)
    {
        if(logs[i].vehicleNumber == vehicleNo)
        {
            let logToRemove = {_id: new ObjectId(String(logs[i]._id)) };

            await MaintenanceLog.deleteOne(logToRemove);
        }
    }
}

//  +++ RACE METHODS +++

//initialize the race data if no data for a race exists
async function initializeRaceData()
{
    console.log("Initializing base race data");
    let initRace =
    {
        raceState: "standby",
        racers: [],
        noOfLaps: 1
    };

    await Race.insertOne(initRace);
}

//get current race data
async function getRaceData()
{
    return await Race.findOne({});
}

//add racer to a new race
async function addRacer(idFilter, raceInfo) 
{
    console.log("adding racer");

    //get all vehicles
    let vehicleList = await getAllVehicles();

    for(let i = 0; 0 < vehicleList.length; i++)
    {
        //console.log(vehicleList[i].status);
        if(vehicleList[i].status == "idle")
        {
            console.log("available vehicle found: " + vehicleList[i]._id);
            //raceInfo.vehicleNumber = vehicleList[i].vehicleNumber;
                
            let vehicleFilter = {_id: new ObjectId(String(vehicleList[i]._id)) };

            //console.log(vehicleFilter);

            let updateVehicle = 
            {
                $set:
                {
                    vehicleNumber: vehicleList[i].vehicleNumber,
                    tagHex: vehicleList[i].tagHex,
                    status: "active"
                },
            };
            await Vehicle.updateOne(vehicleFilter, updateVehicle);
            break;
        }
    }

    let raceUpdate =
    {
        $set:
        {
            raceState: "registration",
            racers: raceInfo.racers,
            noOfLaps: raceInfo.noOfLaps
        },
    };

    await Race.updateOne(idFilter, raceUpdate);
}

//add race data to start a new race
async function startRace(filter, data)
{
    let finalRace =
    {
        $set:
        {
            raceState: data.raceState,
            racers: data.racers,
            noOfLaps: data.noOfLaps
        },
    };

    await Race.updateOne(filter, finalRace);
}

async function addFinalizedRaceData(newRaceRecord)
{
    let raceRecordToAdd = 
    {
        raceDateTime: newRaceRecord.raceDateTime,
        finaPositions: newRaceRecord.finalPositions,
        lapRecords: newRaceRecord.lapRecords,
        noOfLaps: newRaceRecord.noOfLaps,
        racers: newRaceRecord.racers
    }

    await RaceRecord.insertOne(newRaceRecord);
}

//  +++ LAP HISTORY METHODS +++

//get Lap History

async function getLapHistory() 
{
    return await lapHistory.find(
    {});
}

async function getOneLapHistory(data)
{
    return await lapHistory.findOne(
    {
        periodString: data
    });
}

async function initializeLapHistory()
{
    let initDate = new Date();
    let initMonth = initDate.getMonth();

    const month = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    //initialize all time record
    let initGlobalHistory = 
    {
        periodType: 0,
        periodString: 'global',
        periodDate: "N/A",
        recordArray: []
    };
    await lapHistory.insertOne(initGlobalHistory);

    //initialize annual record
    let initAnnualHistory =
    {
        periodType: 1,
        periodString: 'annual',
        periodDate: initDate.getFullYear().toString(),
        recordArray: []
    };

    await lapHistory.insertOne(initAnnualHistory);

    //initialize monthly record
    let initMonthlyHistory =
    {
        periodType: 2,
        periodString: 'monthly',
        periodDate: month[initMonth],
        recordArray: []
    };

    await lapHistory.insertOne(initMonthlyHistory);

    //initialize daily record
    let initDailyHistory =
    {
        periodType: 3,
        periodString: 'daily',
        periodDate: initDate.getDate().toString(),
        recordArray: []
    };

    await lapHistory.insertOne(initDailyHistory);
}

async function alterLapHistory(filter, data)
{
    let lapToUpdate =
    {
        $set:
        {
            periodType: data.periodType,
            periodString: data.periodString,
            periodDate: data.periodDate,
            recordArray: data.recordArray
        },
    };

    await lapHistory.updateOne(filter, lapToUpdate);
}

async function updateLapHistory(filter, data)
{
    let lapToUpdate =
    {
        $set:
        {
            periodType: data.periodType,
            periodString: data.periodString,
            periodDate: data.periodDate,
            recordArray: data.recordArray
        },
    };

    await lapHistory.updateOne(filter, lapToUpdate);
}

//method exports
export default
{
    authenticateUser,
    getUsers,
    addUser,
    getAllVehicles,
    addVehicle,
    getOneVehicle,
    getAllLogs,
    addMaintenanceLog,
    deleteLogs,
    editVehicle,
    deleteVehicle,
    deleteLogs,
    initializeRaceData,
    getRaceData,
    addRacer,
    startRace,
    addFinalizedRaceData,
    getLapHistory,
    initializeLapHistory,
    getLapHistory,
    getOneLapHistory,
    alterLapHistory,
    updateLapHistory
}