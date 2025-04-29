const socket = io();
let myUserId = localStorage.getItem('userId');
const nickname = localStorage.getItem('nickname');

if (!nickname) {
  window.location.href = "index.html";
}

socket.emit('register', { nickname, userId: myUserId });

socket.on('confirmRegistration', (data) => {
  if (data.userId) {
    localStorage.setItem('userId', data.userId);
    myUserId = data.userId;
  }
});

// Variables globales
let usersList = [];
let groupsList = [];
let selectedChatId = null;
let selectedChatName = '';
let selectedIdsForGroup = new Set();
let chatHistory = loadChatHistory();
let destinationUserId = null;

socket.on('updateLists', ({ users, groups }) => {
  usersList = users;
  groupsList = groups;
  renderUserList();
});

socket.on('chatStarted', ({ chatId }) => {
  selectedChatId = chatId;
  clearChat();

  const isGroup = !chatId.includes('-') || chatId.length > 30;

  if (isGroup) {
    selectedChatName = findGroupName(chatId) || "Grupo";
  } else {
    const ids = chatId.split('-');
    const otherId = ids.find(id => id !== myUserId);
    const otherUser = usersList.find(user => user.id === otherId);
    selectedChatName = otherUser ? otherUser.username : "Chat privado";
  }

  updateChatHeader();
  loadChat(chatId);
});

// decide si es privado o grupal
socket.on('receiveMessage', ({ from, message, chatId }) => {
    const isGroup = !chatId.includes('-') || chatId.length > 30;
    const isOwnMessage = (from === "Yo" || from === nickname);
  
    // 🔥 🔥 🔥 Filtrar mensajes propios en grupo 🔥 🔥 🔥
    if (isGroup && isOwnMessage) {
      return; // No dibujes otra vez tu mensaje en grupo
    }
  
    saveMessage(chatId, { from, content: message });
  
    if (selectedChatId !== chatId) {
      selectedChatId = chatId;
  
      if (isGroup) {
        selectedChatName = findGroupName(chatId) || "Grupo";
      } else {
        const ids = chatId.split('-');
        const otherId = ids.find(id => id !== myUserId);
        const otherUser = usersList.find(user => user.id === otherId);
        selectedChatName = otherUser ? otherUser.username : from;
      }
  
      updateChatHeader();
      clearChat();
      loadChat(chatId);
    }
  
    const sender = isOwnMessage ? "Yo" : from;
    addMessage(sender, message);
  });
  
  
  
  
  
  

// 🔵 Función para mensajes privados
function receivePrivateMessage({ from, message, chatId }) {
  saveMessage(chatId, { from, content: message });

  if (selectedChatId !== chatId) {
    selectedChatId = chatId;
    const ids = chatId.split('-');
    const otherId = ids.find(id => id !== myUserId);
    const otherUser = usersList.find(user => user.id === otherId);
    selectedChatName = otherUser ? otherUser.username : from;

    updateChatHeader();
    clearChat();
    loadChat(chatId);
  }

  const sender = from === nickname ? 'Yo' : from;
  addMessage(sender, message);
}

// 🟣 Función para mensajes grupales
function receiveGroupMessage({ from, message, chatId }) {
  saveMessage(chatId, { from, content: message });

  if (selectedChatId !== chatId) {
    selectedChatId = chatId;
    selectedChatName = findGroupName(chatId) || "Grupo";

    updateChatHeader();
    clearChat();
    loadChat(chatId);
  }

  const sender = from === nickname ? 'Yo' : from;
  addMessage(sender, message);
}

// 🎯 Resto de funciones

function renderUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
  
    
    usersList.forEach(user => {
      if (user.username === nickname) {
        const div = document.createElement('div');
        div.classList.add('user-item');
        div.dataset.id = user.id;
        div.dataset.type = "user";
        div.innerHTML = `<span>${user.username} (TÚ)</span>`;
        div.onclick = () => selectPrivateChat(user.id, user.username + ' (TÚ)');
        userList.appendChild(div);
      }
    });
  
    
    groupsList.forEach(group => {
      const isMember = group.name.includes(nickname) || group.name.includes('(TÚ)');
      if (isMember) {
        const div = document.createElement('div');
        div.classList.add('group-item');
        div.dataset.id = group.id;
        div.dataset.type = "group";
        div.innerHTML = `<span>${group.name}</span>`;
        div.onclick = () => selectGroupChat(group.id, group.name);
        userList.appendChild(div);
      }
    });
  }
  

function selectPrivateChat(otherUserId, name) {
    if (!myUserId) return;
  
    const chatId = generateChatId(myUserId, otherUserId);
    selectedChatId = chatId;
    selectedChatName = name;
    destinationUserId = otherUserId; 
    updateChatHeader();
    clearChat();
    loadChat(chatId);
  }
  

function selectGroupChat(groupId, name) {
  selectedChatId = groupId;
  selectedChatName = name;
  destinationUserId = null;
  updateChatHeader();
  clearChat();
  loadChat(groupId);
}

function updateChatHeader() {
  document.getElementById('chatHeader').textContent = selectedChatName;
}

document.getElementById('openGroupModalBtn').onclick = openGroupModal;

function openGroupModal() {
  const modal = document.getElementById('groupModal');
  modal.classList.remove('hidden');

  const selection = document.getElementById('userSelection');
  selection.innerHTML = '';

  usersList.forEach(user => {
    if (user.username !== nickname) {
      const div = document.createElement('div');
      div.textContent = user.username;
      div.dataset.id = user.id;
      div.onclick = () => {
        div.classList.toggle('selected');
        if (div.classList.contains('selected')) {
          selectedIdsForGroup.add(user.id);
        } else {
          selectedIdsForGroup.delete(user.id);
        }
      };
      selection.appendChild(div);
    }
  });
}

function closeGroupModal() {
  const modal = document.getElementById('groupModal');
  modal.classList.add('hidden');
  selectedIdsForGroup.clear();
}

function createGroup() {
  const name = document.getElementById('groupNameInput').value.trim();
  if (!name || selectedIdsForGroup.size < 1) {
    alert('Escribe un nombre y selecciona al menos 1 usuario.');
    return;
  }

  const memberIds = [...selectedIdsForGroup];
  if (!memberIds.includes(myUserId)) {
    memberIds.push(myUserId);
  }

  socket.emit('createGroup', { groupName: name, memberIds });
  closeGroupModal();
}

function sendPrivateMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message || !selectedChatId || !destinationUserId) return; 
  
    socket.emit('sendMessage', {
      message,
      to: destinationUserId
    });
  
    addMessage('Yo', message);
    saveMessage(selectedChatId, { from: 'Yo', content: message });
  
    input.value = '';
  }
  

function sendGroupMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message || !selectedChatId) return;

  socket.emit('sendGroupMessage', {
    message,
    groupId: selectedChatId
  });

  input.value = '';
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message || !selectedChatId) return;

    const isGroup = !selectedChatId.includes('-') || selectedChatId.length > 30;
    const isSelfChat = (selectedChatId === myUserId);

    if (isSelfChat) {
      //  Chat contigo mismo (TÚ)
      addMessage('Yo', message);
      saveMessage(selectedChatId, { from: 'Yo', content: message });
    } else if (isGroup) {
      //  Chat grupal
      socket.emit('sendGroupMessage', {
        message,
        groupId: selectedChatId
      });

      // Mostrar localmente después de enviar
      addMessage('Yo', message);
      saveMessage(selectedChatId, { from: 'Yo', content: message });

    } else {
      //  Chat privado
      if (!destinationUserId) {
        console.error("❌ destinationUserId no está definido.");
        return;
      }

      socket.emit('sendMessage', {
        message,
        to: destinationUserId
      });

      // Mostrar localmente después de enviar
      addMessage('Yo', message);
      saveMessage(selectedChatId, { from: 'Yo', content: message });
    }

    input.value = '';
}

  

function addMessage(sender, content) {
  const chat = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.classList.add('message-bubble');

  const isGroup = !selectedChatId.includes('-') || selectedChatId.length > 30;

  if (sender === "Yo") {
    div.classList.add('me');
    div.textContent = content;
  } else {
    if (isGroup) {
      div.innerHTML = `<strong>${sender}:</strong> ${content}`;
    } else {
      div.textContent = content;
    }
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  document.getElementById('chatMessages').innerHTML = '';
}

function saveMessage(chatId, message) {
  if (!chatId) return;
  if (!chatHistory[chatId]) chatHistory[chatId] = [];
  chatHistory[chatId].push(message);
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function loadChat(chatId) {
  clearChat();
  if (chatHistory[chatId]) {
    chatHistory[chatId].forEach(msg => {
      addMessage(msg.from, msg.content);
    });
  }
}

function loadChatHistory() {
  const stored = localStorage.getItem('chatHistory');
  return stored ? JSON.parse(stored) : {};
}

function findGroupName(groupId) {
  const group = groupsList.find(g => g.id === groupId);
  return group ? group.name : null;
}

function generateChatId(id1, id2) {
  return [id1, id2].sort().join('-');
}

function openUserListModal() {
    const modal = document.getElementById('userListModal');
    const connectedUsers = document.getElementById('connectedUsers');
    connectedUsers.innerHTML = '';
  
    usersList.forEach(user => {
      if (user.username !== nickname) {  
        const div = document.createElement('div');
        div.textContent = user.username;
        connectedUsers.appendChild(div);
      }
    });
  
    modal.classList.remove('hidden');
  }

  function closeUserListModal() {
    const modal = document.getElementById('userListModal');
    modal.classList.add('hidden');
  }
  
  

document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);