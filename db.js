import mongoose, { mongo } from "mongoose";
import {MongoClient, ObjectId} from "mongodb";
import { scryptSync } from "crypto";

//get uri from .env file
const dbUrl = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPWD}@${process.env.DBHOST}/${process.env.DB_NAME}`;

//  +++ USER ACCOUNT DATA +++

//get users from collection
const userDb = new MongoClient(dbUrl).db("users");
const vehicleDb = new MongoClient(dbUrl).db("vehicles");
const maintenanceDb = new MongoClient(dbUrl).db("maintenancelogs");
const raceDb = new MongoClient(dbUrl).db("raceInfo");

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

//racer schema
const RacerSchema = new mongoose.Schema(
{
    racerName: String,
    racerEmail: String,
    vehicleNumber: Number
});

//racer model
const Racer = mongoose.model("Racer", RacerSchema);

//race management schema
const RaceSchema = new mongoose.Schema(
{
    state: String,
    racers: [RacerSchema],
    noOfLaps: Number
});

//race model
const Race = mongoose.model("Race", RaceSchema);

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

// +++ VEHICLE REGISTRY METHODS

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

    await Vehicle.updateOne(filter, vehicleToEdit)
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
    deleteLogs
}