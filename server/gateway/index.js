const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Cargar protos
const userPackageDef = protoLoader.loadSync(path.join(__dirname, '../user-service/user.proto'), {});
const userProto = grpc.loadPackageDefinition(userPackageDef).user;
const userClient = new userProto.UserService('localhost:50051', grpc.credentials.createInsecure());

const groupPackageDef = protoLoader.loadSync(path.join(__dirname, '../group-service/group.proto'), {});
const groupProto = grpc.loadPackageDefinition(groupPackageDef).group;
const groupClient = new groupProto.GroupService('localhost:50052', grpc.credentials.createInsecure());

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../../client')));

// Mapeos
let socketIdToUser = {};   
let userIdToSocketId = {}; 
let userIdToUsername = {}; 
let groups = {};           

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('register', ({ nickname, userId }) => {
    const existingUserId = Object.keys(userIdToUsername).find(id => userIdToUsername[id] === nickname);

    if (existingUserId) {
      socketIdToUser[socket.id] = { userId: existingUserId, username: nickname };
      userIdToSocketId[existingUserId] = socket.id;
      userClient.ListUsers({}, (err, res) => {
        if (!err) {
          res.users.forEach(user => {
            userIdToUsername[user.id] = user.username;
          });
          reloadGroupsFromService(() => {
            socket.emit('confirmRegistration', { userId: existingUserId });
            sendFullList();
          });
        }
      });
    } else {
      userClient.RegisterUser({ username: nickname }, (err, response) => {
        if (err) {
          console.error('Error registrando usuario:', err);
          return;
        }
        const newUserId = response.id;
        socketIdToUser[socket.id] = { userId: newUserId, username: nickname };
        userIdToSocketId[newUserId] = socket.id;
        userIdToUsername[newUserId] = nickname;

        userClient.ListUsers({}, (err, res) => {
          if (!err) {
            res.users.forEach(user => {
              userIdToUsername[user.id] = user.username;
            });
            reloadGroupsFromService(() => {
              socket.emit('confirmRegistration', { userId: newUserId });
              sendFullList();
            });
          }
        });
      });
    }
  });

  // 🔥 Chat privado (privado 1 a 1)
  socket.on('sendMessage', ({ message, to }) => {
    console.log("🛑 EVENTO RECIBIDO: sendMessage", { message, to });
  
    const sender = socketIdToUser[socket.id];
    if (!sender) return;
  
    const myUserId = sender.userId;
    const chatId = generateChatId(myUserId, to);
  
    const targetSocketId = userIdToSocketId[to];
  
    if (!targetSocketId) {
      console.log(`⚠️ Usuario destino no conectado: ${to}`);
      return;
    }
  
    // 🔥 Enviar al receptor
    io.to(targetSocketId).emit('chatStarted', { chatId });
    io.to(targetSocketId).emit('receiveMessage', {
      from: sender.username,
      message,
      chatId
    });
  
    // 🔥 Enviar también al emisor
   /* socket.emit('receiveMessage', {
      from: "Yo",
      message,
      chatId
    });*/
  });
  

  // 🔥 Chat grupal
  socket.on('sendGroupMessage', ({ message, groupId }) => {
    const sender = socketIdToUser[socket.id];
    if (!sender) return;

    const group = groups[groupId];
    if (group) {
      const isMember = group.members.some(m => m.id === sender.userId);
      if (!isMember) {
        console.warn(`⚠️ ${sender.username} intentó enviar a grupo ${groupId} sin ser miembro`);
        return;
      }

      group.members.forEach(member => {
        const memberSocketId = userIdToSocketId[member.id];
        if (memberSocketId) {
          io.to(memberSocketId).emit('chatStarted', { chatId: groupId });
          io.to(memberSocketId).emit('receiveMessage', {
            from: sender.username,
            message,
            chatId: groupId
          });
        }
      });
    }
  });

  socket.on('createGroup', ({ groupName, memberIds }) => {
    groupClient.CreateGroup({ name: groupName, memberIds }, (err, response) => {
      if (err) {
        console.error('Error creando grupo:', err);
        return;
      }

      const groupId = response.groupId;
      console.log(`Grupo creado: ${groupName} (ID: ${groupId})`);
      reloadGroupsFromService(() => {
        sendFullList();
      });
    });
  });

  socket.on('disconnect', () => {
    const userData = socketIdToUser[socket.id];
    if (userData) {
      delete userIdToSocketId[userData.userId];
    }
    delete socketIdToUser[socket.id];
    console.log('Usuario desconectado:', socket.id);
  });
});

// 🔥 Funciones auxiliares

function sendFullList() {
  userClient.ListUsers({}, (err, res) => {
    if (!err) {
      Object.keys(userIdToSocketId).forEach(userId => {
        const userSocketId = userIdToSocketId[userId];

        const groupList = Object.entries(groups)
          .filter(([id, group]) => group.members.some(m => m.id === userId))
          .map(([id, group]) => ({
            id,
            name: `${group.name} (${group.members.map(m => m.username).join(', ')})`
          }));

        io.to(userSocketId).emit('updateLists', {
          users: res.users,
          groups: groupList
        });
      });
    }
  });
}

function reloadGroupsFromService(callback) {
  groupClient.ListGroups({}, (err, res) => {
    if (err) {
      console.error('Error recargando grupos:', err);
      if (callback) callback();
      return;
    }

    if (!res || !res.groups) {
      console.log('ℹ️ No hay grupos que recargar');
      groups = {};
      if (callback) callback();
      return;
    }

    groups = {};
    res.groups.forEach(g => {
      groups[g.id] = {
        name: g.name,
        members: g.memberIds.map(id => ({
          id,
          username: userIdToUsername[id] || id
        }))
      };
    });

    console.log('✅ Grupos recargados desde GroupService');
    if (callback) callback();
  });
}

function generateChatId(id1, id2) {
  return [id1, id2].sort().join('-');
}

server.listen(3000, () => {
  console.log('Gateway corriendo en http://localhost:3000');
});
