const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const packageDefinition = protoLoader.loadSync(path.join(__dirname, './group.proto'), {});
const groupProto = grpc.loadPackageDefinition(packageDefinition).group;

const groups = {}; // { id: { name, memberIds } }

function createGroup(call, callback) {
  const id = uuidv4();
  groups[id] = {
    name: call.request.name,
    memberIds: call.request.memberIds
  };
  console.log(`Grupo creado: ${call.request.name} (ID: ${id})`);
  callback(null, { groupId: id });
}

function listGroups(call, callback) {
  const groupList = Object.keys(groups).map(id => ({
    id,
    name: groups[id].name,
    memberIds: groups[id].memberIds
  }));
  callback(null, { groups: groupList });
}

function main() {
  const server = new grpc.Server();
  server.addService(groupProto.GroupService.service, {
    CreateGroup: createGroup,
    ListGroups: listGroups
  });
  server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    console.log('GroupService gRPC corriendo en puerto 50052');
    server.start();
  });
}

main();
