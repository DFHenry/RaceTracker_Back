import mongoose, { mongo } from "mongoose";
import {MongoClient, ObjectId} from "mongodb";
import { scryptSync } from "crypto";

//get uri from .env file
const dbUrl = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPWD}@${process.env.DBHOST}/${process.env.DB_NAME}`;

//  +++ USER ACCOUNT DATA +++

//get users from collection
const userDb = new MongoClient(dbUrl).db("users");
const vehicleDb = new MongoClient(dbUrl).db("vehicles");
const maintenanceDb = new MongoClient(dbUrl).db("maintenanceLogs");

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

async function editVehicle(filter, vehicleDoc)
{
    let vehicleToEdit = 
    {
        vehicleNumber: vehicleDoc.vehicleNumber,
        tagHex: vehicleDoc.tagHex,
        status: vehicleDoc.status
    }

    const result = await MaintenanceLog.updateOne(filter, vehicleToEdit)
}

//get all relevant vehicle logs
async function getAllLogs(id)
{
    return await MaintenanceLog.find({id});
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

    let result1 = await MaintenanceLog.insertOne(logToAdd);

    // let vehicleToChange = Vehicle.findOne(newLog.vehicleId);

    // let updateVehicle =
    // {
    //     $set:
    //     {
    //         vehicleNumber: vehicleToChange.vehicleNumber,
    //         tagHex: vehicleToChange.tagHex,
    //         status: logToAdd.status
    //     },
    // };

    // const result2 = await Vehicle.updateOne(vehicleToChange, updateVehicle);
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
    editVehicle
}