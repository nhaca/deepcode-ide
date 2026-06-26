let allUsers = [];
let firebaseAdmin = null;
let fbAdminToken = null;

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('page-' + item.dataset.page).classList.add('active');
        if (item.dataset.page === 'dashboard') loadStats();
        if (item.dataset.page === 'users') loadUsers();
        if (item.dataset.page === 'settings') loadSettings();
    });
});

// Toast
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

// Modal
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ========== Firebase Admin Auth ==========
document.getElementById('adminLoginBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('adminTokenInput').value.trim();
    if (!token) {
        document.getElementById('adminLoginError').textContent = 'Vui lòng nhập mã xác thực';
        document.getElementById('adminLoginError').style.display = 'block';
        return;
    }
    try {
        const result = await window.adminAPI.verify(token);
        if (result.success) {
            localStorage.setItem('deepcode-admin-token', token);
            document.getElementById('adminLoginOverlay').style.display = 'none';
            document.getElementById('adminContent').style.display = 'block';
            loadStats();
            loadSettings();
        } else {
            document.getElementById('adminLoginError').textContent = 'Mã xác thực không hợp lệ';
            document.getElementById('adminLoginError').style.display = 'block';
        }
    } catch (e) {
        document.getElementById('adminLoginError').textContent = 'Lỗi: ' + e.message;
        document.getElementById('adminLoginError').style.display = 'block';
    }
});

// ========== Dashboard ==========
async function loadStats() {
    try {
        if (window.adminAPI) {
            const stats = await window.adminAPI.getStats();
            document.getElementById('statsGrid').innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">Total Users</div>
                    <div class="stat-value">${stats.totalUsers || 0}</div>
                    <div class="stat-sub">${stats.blocked || 0} blocked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Tier Distribution</div>
                    <div class="stat-value" style="font-size:18px;">
                        <span class="badge badge-free">Free ${stats.tierDist?.free || 0}</span>
                        <span class="badge badge-pro">PRO ${stats.tierDist?.pro || 0}</span>
                        <span class="badge badge-premium">Premium ${stats.tierDist?.premium || 0}</span>
                        <span class="badge badge-business">Biz ${stats.tierDist?.business || 0}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Requests</div>
                    <div class="stat-value">${stats.totalRequests || 0}</div>
                </div>
            `;
        }
    } catch (e) {
        showToast('Failed to load stats: ' + e.message);
    }
}

// ========== Users ==========
async function loadUsers() {
    try {
        if (window.adminAPI) {
            allUsers = await window.adminAPI.getAllUsers();
        } else {
            allUsers = [];
        }
        renderUsers(allUsers);
    } catch (e) {
        showToast('Failed to load users: ' + e.message);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTable');
    document.getElementById('userCount').textContent = users.length + ' users';
    tbody.innerHTML = users.map(u => `
        <tr>
            <td style="font-family:monospace;font-size:11px;">${esc(u.id)}</td>
            <td>${esc(u.displayName) || '-'}</td>
            <td>${esc(u.email) || '-'}</td>
            <td><span class="badge badge-${esc(u.tier)}">${esc(u.tier)}</span></td>
            <td><span class="badge badge-${u.blocked ? 'blocked' : 'active'}">${u.blocked ? 'Blocked' : 'Active'}</span></td>
            <td>${parseInt(u.requestsToday) || 0}</td>
            <td>${parseInt(u.totalRequests) || 0}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" onclick="editUser('${esc(u.id)}')">Edit</button>
                    ${u.blocked
                        ? `<button class="btn btn-sm btn-success" onclick="unblockUser('${esc(u.id)}')">Unblock</button>`
                        : `<button class="btn btn-sm btn-danger" onclick="blockUser('${esc(u.id)}')">Block</button>`
                    }
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${esc(u.id)}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase();
    const filter = document.getElementById('userFilter').value;
    let filtered = allUsers;
    if (query) {
        filtered = filtered.filter(u => u.id.toLowerCase().includes(query) || (u.displayName || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query));
    }
    if (filter !== 'all') {
        if (['active', 'blocked'].includes(filter)) {
            filtered = filtered.filter(u => filter === 'blocked' ? u.blocked : !u.blocked);
        } else {
            filtered = filtered.filter(u => u.tier === filter);
        }
    }
    renderUsers(filtered);
}

function showAddUserModal() {
    document.getElementById('newUserId').value = '';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserTier').value = 'free';
    document.getElementById('addUserModal').classList.add('active');
}

async function addUser() {
    const id = document.getElementById('newUserId').value.trim();
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const tier = document.getElementById('newUserTier').value;
    if (!id) return showToast('User ID required');
    if (window.adminAPI) {
        await window.adminAPI.addUser(id, name, email, tier);
    }
    closeModal('addUserModal');
    showToast('User added!');
    loadUsers();
}

function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserTier').value = user.tier;
    document.getElementById('editUserNotes').value = user.notes || '';
    document.getElementById('editUserModal').classList.add('active');
}

async function saveUserEdit() {
    const userId = document.getElementById('editUserId').value;
    const tier = document.getElementById('editUserTier').value;
    const notes = document.getElementById('editUserNotes').value;
    if (window.adminAPI) {
        await window.adminAPI.updateUser(userId, { tier, notes });
    }
    closeModal('editUserModal');
    showToast('User updated!');
    loadUsers();
}

async function blockUser(userId) {
    document.getElementById('blockUserId').value = userId;
    document.getElementById('blockReason').value = '';
    document.getElementById('blockUserModal').classList.add('active');
}

async function confirmBlockUser() {
    const userId = document.getElementById('blockUserId').value;
    const reason = document.getElementById('blockReason').value || 'Blocked by admin';
    if (window.adminAPI) {
        await window.adminAPI.blockUser(userId, reason);
    }
    closeModal('blockUserModal');
    showToast('User blocked!');
    loadUsers();
}

async function unblockUser(userId) {
    if (window.adminAPI) {
        await window.adminAPI.unblockUser(userId);
    }
    showToast('User unblocked!');
    loadUsers();
}

async function deleteUser(userId) {
    document.getElementById('deleteUserId').value = userId;
    document.getElementById('deleteUserModal').classList.add('active');
}

async function confirmDeleteUser() {
    const userId = document.getElementById('deleteUserId').value;
    if (window.adminAPI) {
        await window.adminAPI.deleteUser(userId);
    }
    closeModal('deleteUserModal');
    showToast('User deleted!');
    loadUsers();
}

// ========== Settings ==========
async function loadSettings() {
    try {
        const emailConfig = await window.adminAPI.getEmailConfig();
        if (emailConfig.configured) {
            document.getElementById('emailUser').value = emailConfig.user;
            document.getElementById('emailAdmin').value = emailConfig.adminEmail;
            document.getElementById('emailStatus').innerHTML = '<span style="color:#22c55e;">Da cau hinh</span>';
        }
        const cfConfig = await window.adminAPI.getCfConfig();
        if (cfConfig.accountId) {
            document.getElementById('cfAccountId').value = cfConfig.accountId;
            document.getElementById('cfStatus').innerHTML = '<span style="color:#22c55e;">Da cau hinh: ' + cfConfig.model + '</span>';
        }
    } catch (e) {}
}

async function saveEmailConfig() {
    const user = document.getElementById('emailUser').value.trim();
    const pass = document.getElementById('emailPassword').value.trim();
    const admin = document.getElementById('emailAdmin').value.trim();
    if (!user || !pass || !admin) return showToast('Nhap day du thong tin');
    const result = await window.adminAPI.setupEmail(user, pass, admin);
    if (result.success) {
        showToast('Luu cau hinh email thanh cong!');
        document.getElementById('emailStatus').innerHTML = '<span style="color:#22c55e;">Da cau hinh</span>';
        document.getElementById('emailPassword').value = '';
    } else {
        document.getElementById('emailStatus').innerHTML = '<span style="color:#ef4444;">' + esc(result.error) + '</span>';
    }
}

async function saveCfConfig() {
    const accountId = document.getElementById('cfAccountId').value.trim();
    if (!accountId) return showToast('Nhap Cloudflare Account ID');
    const result = await window.adminAPI.setCfAccountId(accountId);
    if (result.success) {
        showToast('Luu cau hinh Cloudflare thanh cong!');
        document.getElementById('cfStatus').innerHTML = '<span style="color:#22c55e;">Da cau hinh</span>';
    } else {
        document.getElementById('cfStatus').innerHTML = '<span style="color:#ef4444;">Loi</span>';
    }
}

// Init: check if already logged in
(function() {
    const content = document.getElementById('adminContent');
    const overlay = document.getElementById('adminLoginOverlay');
    const savedToken = localStorage.getItem('deepcode-admin-token');
    if (savedToken && content && overlay) {
        window.adminAPI.verify(savedToken).then(result => {
            if (result.success) {
                overlay.style.display = 'none';
                content.style.display = 'block';
                loadStats();
                loadSettings();
            }
        }).catch(() => {});
    } else if (content) {
        content.style.display = 'none';
    }
})();
