const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const packageDefinition = protoLoader.loadSync(path.join(__dirname, './user.proto'), {});
const userProto = grpc.loadPackageDefinition(packageDefinition).user;

const users = {}; // { id: { username, online } }

function registerUser(call, callback) {
  const id = uuidv4();
  users[id] = {
    username: call.request.username,
    online: true
  };
  console.log(`Nuevo usuario registrado: ${call.request.username} (ID: ${id})`);
  callback(null, { id });
}

function setUserStatus(call, callback) {
  const { id, online } = call.request;
  if (users[id]) {
    users[id].online = online;
    console.log(`Estado cambiado: ${users[id].username} -> ${online ? 'online' : 'offline'}`);
    callback(null, { success: true });
  } else {
    callback(null, { success: false });
  }
}

function listUsers(call, callback) {
  const userList = Object.keys(users).map(id => ({
    id,
    username: users[id].username,
    online: users[id].online
  }));
  callback(null, { users: userList });
}

function main() {
  const server = new grpc.Server();
  server.addService(userProto.UserService.service, {
    RegisterUser: registerUser,
    SetUserStatus: setUserStatus,
    ListUsers: listUsers
  });
  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('UserService gRPC corriendo en puerto 50051');
    server.start();
  });
}

main();
