let socket = io();
let currentUser = null;
let currentChat = null;
let selectedAvatar = 'default';

function showAuthTab(tabName) {
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

function selectAvatar(element, avatarType) {
    document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    selectedAvatar = avatarType;
}

function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!username || !password) {
        showAuthError('Заполните все поля');
        return;
    }

    const avatar = selectedAvatar === 'default' 
        ? https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff
        : https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${selectedAvatar === 'male' ? '4CAF50' : 'E91E63'}&color=fff;

    socket.emit('register', { username, password, avatar });
}

function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
        showAuthError('Заполните все поля');
        return;
    }

    socket.emit('login', { username, password });
}

function logout() {
    currentUser = null;
    currentChat = null;
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    socket.disconnect();
    socket.connect();
}

function showAuthError(message) {
    document.getElementById('authError').textContent = message;
    setTimeout(() => {
        document.getElementById('authError').textContent = '';
    }, 3000);
}

function searchUsers() {
    const query = document.getElementById('searchInput').value.trim();
    if (query.length >= 2) {
        socket.emit('search_users', query);
    } else {
        document.getElementById('searchResults').innerHTML = '<div class="empty-state">Введите минимум 2 символа</div>';
    }
}

function sendFriendRequest(userId) {
    socket.emit('send_friend_request', userId);
    event.target.disabled = true;
    event.target.textContent = 'Запрос отправлен';
}

function acceptFriendRequest(fromUserId) {
    socket.emit('accept_friend_request', fromUserId);
    event.target.parentElement.remove();
}

function openPrivateChat(friend) {
    currentChat = friend.id;
    document.getElementById('privateChatHeader').innerHTML = 
        <img src="${friend.avatar}" alt="Аватар" class="user-avatar" style="width: 30px; height: 30px;">
        Чат с ${friend.username}
        <span class="${friend.online ? 'online-dot' : 'offline-dot'}"></span>
    ;
    document.getElementById('privateChat').style.display = 'flex';
    document.getElementById('privateMessages').innerHTML = '';
    
    // Загружаем историю сообщений
    socket.emit('load_chat_history', friend.id);
}

function sendPrivateMessage() {
    const input = document.getElementById('privateMessageInput');
    const text = input.value.trim();
    if (text && currentChat) {
        socket.emit('private_message', {
            to: currentChat,
            text: text
        });
        input.value = '';
    }
}

function sendGlobalMessage() {
    const input = document.getElementById('globalMessageInput');
    const text = input.value.trim();
    if (text) {
        socket.emit('global_message', text);
        input.value = '';
    }
}

// Socket listeners
socket.on('register_success', (data) => {
    currentUser = data.user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    updateUserInterface();
});
socket.on('register_error', (error) => {
    showAuthError(error);
});

socket.on('login_success', (data) => {
    currentUser = data.user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    updateUserInterface();
    updateFriendsList(data.friends);
});

socket.on('login_error', (error) => {
    showAuthError(error);
});

socket.on('search_results', (results) => {
    const resultsDiv = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-state">Пользователи не найдены</div>';
        return;
    }

    resultsDiv.innerHTML = results.map(user => 
        <div class="user-result">
            <img src="${user.avatar}" alt="Аватар" class="user-avatar">
            <div>
                <strong>${user.username}</strong>
            </div>
            <button class="add-friend-btn" onclick="sendFriendRequest('${user.id}')">Добавить</button>
        </div>
    ).join('');
});

socket.on('new_friend_request', (data) => {
    // Можно добавить уведомление
    console.log('Новая заявка в друзья от:', data.from);
});

socket.on('friend_added', (friend) => {
    updateFriendsList([...getCurrentFriends(), friend]);
});

socket.on('chat_history', (data) => {
    if (data.friendId === currentChat) {
        const messagesDiv = document.getElementById('privateMessages');
        messagesDiv.innerHTML = '';
        data.messages.forEach(message => addPrivateMessage(message));
    }
});

socket.on('new_private_message', (message) => {
    if (message.from === currentChat || message.to === currentChat) {
        addPrivateMessage(message);
    }
});

socket.on('new_global_message', (message) => {
    addGlobalMessage(message);
});

function updateUserInterface() {
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userAvatar').src = currentUser.avatar;
    document.getElementById('welcomeText').textContent = Добро пожаловать, ${currentUser.username}!;
}

function updateFriendsList(friends) {
    const friendsList = document.getElementById('friendsList');
    
    if (friends.length === 0) {
        friendsList.innerHTML = '<div class="empty-state">У вас пока нет друзей</div>';
        return;
    }

    friendsList.innerHTML = friends.map(friend => 
        <div class="friend-item" onclick="openPrivateChat(${JSON.stringify(friend).replace(/"/g, '&quot;')})">
            <img src="${friend.avatar}" alt="Аватар" class="user-avatar">
            <div>
                <strong>${friend.username}</strong>
            </div>
            <span class="${friend.online ? 'online-dot' : 'offline-dot'}"></span>
        </div>
    ).join('');
}

function getCurrentFriends() {
    // Возвращает текущий список друзей из DOM
    const friendElements = document.querySelectorAll('.friend-item');
    return Array.from(friendElements).map(el => {
        const img = el.querySelector('img');
        const strong = el.querySelector('strong');
        const dot = el.querySelector('.online-dot, .offline-dot');
        return {
            id: el.onclick.toString().match(/id": "([^"]+)/)[1],
            username: strong.textContent,
            avatar: img.src,
            online: dot.classList.contains('online-dot')
        };
    });
}

function addPrivateMessage(message) {
    const messagesDiv = document.getElementById('privateMessages');
    const messageElement = document.createElement('div');
    const isOwn = message.from === currentUser.id;
    
    messageElement.className = message ${isOwn ? 'own' : 'other'};
    messageElement.innerHTML = 
        <div><strong>${isOwn ? 'Вы' : getUsernameById(message.from)}</strong></div>
        ${message.text}
        <div class="time">${message.time}</div>
    ;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function addGlobalMessage(message) {
    const messagesDiv = document.getElementById('globalMessages');
    const messageElement = document.createElement('div');
    const isOwn = message.from === currentUser.id;
    
    messageElement.className = message ${isOwn ? 'own' : 'other'};
    messageElement.innerHTML = 
        <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${message.avatar}" alt="Аватар" style="width: 20px; height: 20px; border-radius: 50%;">
            <strong>${isOwn ? 'Вы' : message.username}</strong>
        </div>
        ${message.text}
        <div class="time">${message.time}</div>
    ;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getUsernameById(userId) {
    // В реальном приложении нужно хранить кэш пользователей
    return 'Пользователь';
}

function openTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('globalTab').classList.contains('active')) {
            sendGlobalMessage();
        } else if (document.getElementById('privateMessageInput').value) {
            sendPrivateMessage();
        }
    }
});
