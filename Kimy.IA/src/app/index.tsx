import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList,
  Keyboard, StatusBar, Image, ActivityIndicator, Modal, Platform, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

// --- Configuración Segura de la API Key ---
const getApiKey = () => {
  const keyFromConfig = Constants.expoConfig?.extra?.expoPublicGeminiApiKey;
  const keyFromEnv = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  return (keyFromConfig || keyFromEnv || "").trim();
};

const BOT_IMAGE_LOCAL = require('../../assets/images/kimy_avatar.png');

const STORAGE_KEY_MESSAGES = '@kimy_chat_messages';
const STORAGE_KEY_USERNAME = '@kimy_username';
const STORAGE_KEY_USERPHOTO = '@kimy_user_photo';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'kimy';
  timestamp: Date;
}

interface AlertConfig {
  visible: boolean;
  title: string;
  message: string;
  buttons: Array<{ text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }>;
}

export default function Index() {
  const [currentScreen, setCurrentScreen] = useState<'chat' | 'settings'>('chat');
  const [username, setUsername] = useState('Usuario');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: '¡Hola! Soy Kimy.IA. ¿De qué te gustaría hablar hoy?', sender: 'kimy', timestamp: new Date() },
  ]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false, title: '', message: '', buttons: []
  });

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadCachedData();
  }, []);

  const loadCachedData = async () => {
    try {
      const savedUsername = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      if (savedUsername) setUsername(savedUsername);

      const savedPhoto = await AsyncStorage.getItem(STORAGE_KEY_USERPHOTO);
      if (savedPhoto) setUserPhoto(savedPhoto);

      const savedMessages = await AsyncStorage.getItem(STORAGE_KEY_MESSAGES);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        if (parsed.length > 0) setMessages(parsed);
      }
    } catch (error) {
      console.error("Error al cargar caché:", error);
    }
  };

  useEffect(() => {
    if (messages.length > 1) {
      AsyncStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    }
  }, [messages]);

  const saveUsernameToCache = async (name: string) => {
    setUsername(name);
    await AsyncStorage.setItem(STORAGE_KEY_USERNAME, name);
  };

  const savePhotoToCache = async (uri: string) => {
    setUserPhoto(uri);
    await AsyncStorage.setItem(STORAGE_KEY_USERPHOTO, uri);
  };

  const showAlert = (title: string, message: string, buttons: AlertConfig['buttons'] = [{ text: 'OK' }]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) return 'Hoy';
    if (isYesterday(date)) return 'Ayer';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
  };

  const confirmClearMessages = () => {
    showAlert(
      "Eliminar historial",
      "¿Estás seguro de que quieres borrar todos los mensajes?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar todo",
          style: "destructive",
          onPress: async () => {
            const initialMsg: Message[] = [{ id: Date.now().toString(), text: '¡Hola! Soy Kimy.IA. ¿En qué puedo ayudarte hoy?', sender: 'kimy', timestamp: new Date() }];
            setMessages(initialMsg);
            await AsyncStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(initialMsg));
          }
        }
      ]
    );
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showAlert("Permiso requerido", "Se necesitan permisos para acceder a la galería.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].uri) {
      savePhotoToCache(result.assets[0].uri);
    }
  };

  const sendMessage = async () => {
    if (inputText.trim().length === 0 || isTyping) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
      showAlert("Falta Configuración", "La API Key de Gemini no se detectó. Asegúrate de definir EXPO_PUBLIC_GEMINI_API_KEY en tu archivo .env");
      return;
    }

    const userText = inputText;
    const newMessage: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: new Date() };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const recentHistory = updatedMessages.slice(-8).map(m => {
        return `${m.sender === 'user' ? username : 'Kimy.IA'}: ${m.text}`;
      }).join('\n');

      const promptConContexto =
        `Eres Kimy.IA, una asistente virtual en español amigable, empática, educada y servicial. Te estás comunicando con ${username}.` +
        `Tu tono debe ser natural, conversacional y agradable.` +
        `\n\nHistorial reciente:\n${recentHistory}\n\nKimy.IA:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptConContexto }] }],
            generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Detalle del error de la API:", errorBody);
        throw new Error(`Error en la conexión (Status: ${response.status})`);
      }

      const data = await response.json();
      const botResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no recibí una respuesta válida.';

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: botResponseText.trim(),
        sender: 'kimy',
        timestamp: new Date()
      }]);
    } catch (error: any) {
      console.error("Error:", error);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: '¡Ups! Falló la conexión con la IA. Verifica tu llave o conexión.', sender: 'kimy', timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const NeonAlert = () => (
    <Modal visible={alertConfig.visible} transparent animationType="fade">
      <View style={styles.alertOverlay}>
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>{alertConfig.title}</Text>
          <Text style={styles.alertMessage}>{alertConfig.message}</Text>
          <View style={styles.alertButtonsContainer}>
            {alertConfig.buttons.map((btn, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.alertButton, btn.style === 'destructive' && styles.alertBtnDestructive]}
                onPress={() => {
                  setAlertConfig(prev => ({ ...prev, visible: false }));
                  if (btn.onPress) btn.onPress();
                }}
              >
                <Text style={[styles.alertButtonText, btn.style === 'cancel' && styles.alertBtnCancelText]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );

  if (currentScreen === 'settings') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('chat')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ajustes de Perfil</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.settingsContent}>
          <TouchableOpacity style={styles.avatarContainerSettings} onPress={pickImage}>
            {userPhoto ? (
              <Image source={{ uri: userPhoto }} style={styles.settingsAvatarPreview} />
            ) : (
              <View style={[styles.settingsAvatarPreview, styles.avatarPlaceholderSettings]}>
                <Ionicons name="camera-outline" size={45} color="#fff" />
                <Text style={styles.placeholderTextSettings}>Cambiar foto</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Nombre de Usuario</Text>
          <TextInput
            style={styles.settingsInput}
            value={username}
            onChangeText={saveUsernameToCache}
            placeholder="Escribe tu nombre..."
            placeholderTextColor="rgba(255,255,255,0.5)"
          />

          <TouchableOpacity style={styles.saveButton} onPress={() => setCurrentScreen('chat')}>
            <Text style={styles.saveButtonText}>Guardar y Volver</Text>
          </TouchableOpacity>
        </View>
        <NeonAlert />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={BOT_IMAGE_LOCAL} style={styles.headerAvatar} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Kimy.IA</Text>
            <Text style={styles.headerStatus}>en línea</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={confirmClearMessages} style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={22} color="#FF1493" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentScreen('settings')} style={styles.actionIcon}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <LinearGradient
          colors={['#0000FF', '#FF1493']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chatContainer}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item, index }) => {
              const isUser = item.sender === 'user';
              const showDateHeader = index === 0 || formatMessageDate(messages[index - 1].timestamp) !== formatMessageDate(item.timestamp);

              return (
                <View>
                  {showDateHeader && (
                    <View style={styles.dateContainer}>
                      <Text style={styles.dateText}>{formatMessageDate(item.timestamp)}</Text>
                    </View>
                  )}
                  <View style={[styles.messageRow, isUser ? styles.userRow : styles.kimyRow]}>
                    {isUser ? (
                      userPhoto ? <Image source={{ uri: userPhoto } } style={styles.chatAvatarRow} />
                      : <View style={[styles.chatAvatarRow, styles.rowPlaceholder]}><Ionicons name="person" size={16} color="#aaa" /></View>
                    ) : (
                      <Image source={BOT_IMAGE_LOCAL} style={styles.chatAvatarRow} />
                    )}
                    <View style={[styles.bubble, isUser ? styles.userBubble : styles.kimyBubble]}>
                      {isUser && <Text style={styles.usernameTag}>{username}</Text>}
                      <Text style={styles.messageText}>{item.text}</Text>
                      <Text style={styles.timeText}>{format(item.timestamp, 'hh:mm a')}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {isTyping && (
            <View style={styles.typingContainer}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.typingText}>Kimy.IA está pensando...</Text>
            </View>
          )}

          <View style={styles.footer}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Escribe un mensaje..."
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>
      <NeonAlert />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#000',
    borderBottomWidth: 1, borderBottomColor: '#FF1493'
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, borderWidth: 1, borderColor: '#FF1493' },
  headerTextContainer: { justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  headerStatus: { fontSize: 12, color: '#FF1493' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  actionIcon: { marginLeft: 16, padding: 4 },
  backButton: { padding: 4 },
  chatContainer: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 10 },
  dateContainer: { alignItems: 'center', marginVertical: 10 },
  dateText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  messageRow: { flexDirection: 'row', marginVertical: 6, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  kimyRow: { justifyContent: 'flex-start' },
  chatAvatarRow: { width: 30, height: 30, borderRadius: 15, marginHorizontal: 8 },
  rowPlaceholder: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  bubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: 'rgba(255, 20, 147, 0.8)', borderBottomRightRadius: 4 },
  kimyBubble: { backgroundColor: 'rgba(0, 0, 255, 0.7)', borderBottomLeftRadius: 4 },
  usernameTag: { fontSize: 11, fontWeight: 'bold', color: '#FFD700', marginBottom: 2 },
  messageText: { fontSize: 14, color: '#fff' },
  timeText: { fontSize: 9, color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginTop: 4 },
  typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' },
  footer: { padding: 10, backgroundColor: 'transparent' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 25, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  input: { flex: 1, color: '#fff', maxHeight: 100, fontSize: 14, paddingVertical: 6 },
  sendButton: { backgroundColor: '#FF1493', justifyContent: 'center', alignItems: 'center', width: 36, height: 36, borderRadius: 18, marginLeft: 8 },
  settingsContent: { flex: 1, padding: 20, alignItems: 'center', backgroundColor: '#000' },
  avatarContainerSettings: { marginBottom: 25, marginTop: 10 },
  settingsAvatarPreview: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#FF1493' },
  avatarPlaceholderSettings: { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  placeholderTextSettings: { color: '#fff', fontSize: 11, marginTop: 4 },
  label: { alignSelf: 'flex-start', color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  settingsInput: { width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, marginBottom: 20 },
  saveButton: { width: '100%', backgroundColor: '#00FFCC', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveButtonText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  alertBox: { width: '80%', backgroundColor: '#1A1A2E', borderRadius: 15, padding: 20, borderWidth: 1, borderColor: '#FF1493', alignItems: 'center' },
  alertTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 10, textAlign: 'center' },
  alertMessage: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 20 },
  alertButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  alertButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#0000FF' },
  alertBtnDestructive: { backgroundColor: '#FF3B30' },
  alertButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  alertBtnCancelText: { color: '#ccc' }
});