// Operações de grupo no Firebase: conta da criadora, convites com validade e membros.
// As permissões de verdade ficam em firestore.rules; aqui só fazemos os pedidos.
import { db, auth, authReady } from '../../firebase-config.js';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  arrayUnion, arrayRemove, deleteField, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  EmailAuthProvider, GoogleAuthProvider, linkWithCredential, linkWithPopup, signInWithCredential,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

export const INVITE_HOURS = 24;

// Sem letras confusas (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length) {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return Array.from(random, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
}

export async function currentUser() {
  await authReady;
  return auth.currentUser;
}

/**
 * Transforma o login anônimo deste aparelho numa conta com e-mail e senha,
 * mantendo o mesmo ID. A senha é guardada pelo Firebase de forma embaralhada.
 */
export async function ensureCreatorAccount(email, password) {
  const user = await currentUser();
  if (user.email) return user;
  const credential = EmailAuthProvider.credential(String(email).trim(), password);
  const result = await linkWithCredential(user, credential);
  // Atualiza o "crachá" para as regras enxergarem o e-mail novo
  await result.user.getIdToken(true);
  return result.user;
}

/**
 * Conta da criadora pelo Google. Se este aparelho ainda é anônimo, liga o Google
 * a ele (mantém o mesmo ID). Com allowSwitch, se essa conta Google já existir,
 * entra nela. Precisa ser chamada logo no toque do botão (abre uma janela do Google).
 */
export async function googleCreatorAccount({ allowSwitch = true } = {}) {
  const user = auth.currentUser || await currentUser();
  if (user.email) return user;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await linkWithPopup(user, provider);
    await result.user.getIdToken(true);
    return result.user;
  } catch (error) {
    const credential = GoogleAuthProvider.credentialFromError(error);
    if (allowSwitch && error.code === 'auth/credential-already-in-use' && credential) {
      const result = await signInWithCredential(auth, credential);
      return result.user;
    }
    throw error;
  }
}

export async function createGroup(menuName, creatorName) {
  const user = await currentUser();
  const name = String(creatorName).trim();
  // Se o código sorteado já existir, as regras recusam (não sobrescreve) e sorteamos outro
  for (let attempt = 1; ; attempt++) {
    const groupId = randomCode(8);
    try {
      await setDoc(doc(db, 'grupos', groupId), {
        accessKey: groupId,
        menuName: String(menuName).trim(),
        creatorName: name,
        createdAt: new Date().toISOString(),
        ownerUid: user.uid,
        memberUids: [user.uid],
        memberNames: { [user.uid]: name },
        data: {}
      });
      return groupId;
    } catch (error) {
      if (error.code !== 'permission-denied' || attempt >= 3) throw error;
    }
  }
}

/**
 * Entra com e-mail e senha e devolve o cardápio mais recente criado por essa conta.
 */
export async function loginCreator(email, password) {
  await authReady;
  const { user } = await signInWithEmailAndPassword(auth, String(email).trim(), password);
  return findOwnedGroup(user);
}

export async function loginCreatorWithGoogle() {
  const user = await googleCreatorAccount();
  return findOwnedGroup(user);
}

async function findOwnedGroup(user) {
  const snapshot = await getDocs(query(collection(db, 'grupos'), where('ownerUid', '==', user.uid)));
  if (snapshot.empty) return null;

  const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  groups.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const group = groups[0];
  return {
    groupId: group.id,
    menuName: group.menuName || '',
    name: (group.memberNames && group.memberNames[user.uid]) || group.creatorName || ''
  };
}

export async function resetPassword(email) {
  await authReady;
  await sendPasswordResetEmail(auth, String(email).trim());
}

export async function logout() {
  await authReady;
  await signOut(auth);
}

/**
 * Registra este aparelho no grupo. Para quem já é membro não muda nada;
 * para grupos antigos (código de 4 letras) faz a migração automática.
 */
const joinedGroups = {};
export function joinGroup(groupId, userName) {
  const key = String(groupId || '').trim().toUpperCase();
  if (!key) return Promise.resolve();
  if (!joinedGroups[key]) {
    joinedGroups[key] = currentUser().then((user) => {
      const update = { memberUids: arrayUnion(user.uid) };
      const name = String(userName || '').trim();
      if (name) update[`memberNames.${user.uid}`] = name;
      return updateDoc(doc(db, 'grupos', key), update);
    }).catch((error) => {
      delete joinedGroups[key];
      throw error;
    });
  }
  return joinedGroups[key];
}

export async function createInvite(groupId, menuName) {
  const user = await currentUser();
  const inviteId = randomCode(24);
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_HOURS * 60 * 60 * 1000);
  await setDoc(doc(db, 'convites', inviteId), {
    groupId: String(groupId).trim().toUpperCase(),
    menuName: String(menuName || '').trim(),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt
  });
  return { inviteId, expiresAt: expiresAt.toMillis() };
}

export async function getInvite(inviteId) {
  await authReady;
  const snapshot = await getDoc(doc(db, 'convites', String(inviteId).trim()));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    groupId: data.groupId,
    menuName: data.menuName || '',
    expired: !data.expiresAt || data.expiresAt.toMillis() <= Date.now()
  };
}

export async function acceptInvite(inviteId, groupId, userName) {
  const user = await currentUser();
  await updateDoc(doc(db, 'grupos', groupId), {
    memberUids: arrayUnion(user.uid),
    [`memberNames.${user.uid}`]: String(userName).trim(),
    [`memberInvites.${user.uid}`]: String(inviteId).trim()
  });
}

/**
 * Só a criadora consegue (garantido pelas regras). Links de convite já enviados
 * deixam de valer, para a pessoa removida não voltar com um link antigo.
 */
export async function removeMember(groupId, uid) {
  await updateDoc(doc(db, 'grupos', groupId), {
    memberUids: arrayRemove(uid),
    [`memberNames.${uid}`]: deleteField(),
    [`memberInvites.${uid}`]: deleteField(),
    invitesValidAfter: serverTimestamp()
  });
}

/**
 * Criadora de um grupo antigo cadastra e-mail e senha e passa a ser a dona.
 */
export async function claimLegacyGroup(groupId, email, password, name) {
  const user = await ensureCreatorAccount(email, password);
  await setLegacyOwner(groupId, user, name);
}

export async function claimLegacyGroupWithGoogle(groupId, name) {
  // Sem trocar de conta: o ID deste aparelho é o que está na lista do grupo
  const user = await googleCreatorAccount({ allowSwitch: false });
  await setLegacyOwner(groupId, user, name);
}

async function setLegacyOwner(groupId, user, name) {
  const cleanName = String(name || '').trim();
  const update = { ownerUid: user.uid };
  if (cleanName) {
    update.creatorName = cleanName;
    update[`memberNames.${user.uid}`] = cleanName;
  }
  await updateDoc(doc(db, 'grupos', groupId), update);
}

export function authErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'Esse e-mail já tem cadastro. Use "Já criei um cardápio" para entrar.',
    'auth/credential-already-in-use': 'Essa conta já está cadastrada. Use outra conta ou entre com e-mail e senha.',
    'auth/invalid-email': 'Esse e-mail não parece certo. Confira e tente de novo.',
    'auth/missing-email': 'Digite o seu e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/missing-password': 'Digite a senha.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem internet. Verifique a conexão e tente de novo.',
    'auth/operation-not-allowed': 'O login por e-mail ainda não foi ativado no Firebase.',
    'auth/admin-restricted-operation': 'O login anônimo ainda não foi ativado no Firebase.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
    'auth/cancelled-popup-request': 'A janela do Google foi fechada antes de terminar.',
    'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Toque de novo no botão.',
    'auth/unauthorized-domain': 'Este site ainda não foi autorizado no Firebase (Domínios autorizados).',
    'auth/account-exists-with-different-credential': 'Esse e-mail já tem cadastro com senha. Entre com e-mail e senha.',
    'permission-denied': 'Sem permissão para fazer isso.',
    'unavailable': 'Sem internet. Verifique a conexão e tente de novo.'
  };
  return messages[error && error.code] || 'Algo deu errado. Tente de novo.';
}
