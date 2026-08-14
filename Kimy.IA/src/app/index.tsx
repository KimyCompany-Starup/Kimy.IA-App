import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList,
  Keyboard, StatusBar, Image, ActivityIndicator, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

const GEMINI_API_KEY = 
  Constants.expoConfig?.extra?.expoPublicGeminiApiKey || 
  process.env.EXPO_PUBLIC_GEMINI_API_KEY || 
  "";

const BOT_IMAGE_LOCAL = require('../../assets/images/kimy_avatar.png');

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

export default function ChatScreen() {
  const [currentScreen, setCurrentScreen] = useState<'chat' | 'settings'>('chat');
  const [username, setUsername] = useState('Usuario');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: '¡Hola! Soy Kimy.IA 💖 ¿De qué te gustaría hablar hoy?', sender: 'kimy', timestamp: new Date() },
  ]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false, title: '', message: '', buttons: []
  });

  const showAlert = (title: string, message: string, buttons: AlertConfig['buttons'] = [{ text: 'OK' }]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height + 40));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
          onPress: () => setMessages([
            { id: Date.now().toString(), text: '¡Hola! Soy Kimy.IA 💖 ¿En qué puedo ayudarte hoy?', sender: 'kimy', timestamp: new Date() }
          ])
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
    if (!result.canceled) setUserPhoto(result.assets[0].uri);
  };

  const sendMessage = async () => {
    if (inputText.trim().length === 0 || isTyping) return;
    
    if (!GEMINI_API_KEY) {
      showAlert("Falta Conexión con la IA", "No se encontró la conexion con la IA.");
      return;
    }

    const userText = inputText;
    const newMessage: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: new Date() };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      const promptConContexto =
        `Eres Kimy.IA, una asistente virtual en español amigable, carismática, alegre y muy atenta. Te estás comunicando con tu usuario preferido: ${username}. Responde siempre manteniendo esta personalidad, sé natural, fluida y usa emojis acordes a ti.\n\n` +
        `⚠️ REGLA IMPORTANTE: No tienes acceso a internet ni datos en tiempo real. Si el usuario te pregunta por el clima actual, la hora exacta, noticias de hoy o eventos en tiempo real, debes responder con mucha amabilidad, carisma y emojis explicando que por el momento no puedes ayudarle con información en tiempo real, pero que estás lista para hablar de cualquier otra cosa divertida.\n\n` +
        `Usuario: ${userText}\nKimy.IA:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptConContexto }] }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        const customError = new Error(errorData);
        (customError as any).status = response.status;
        throw customError;
      }

      const data = await response.json();
      const botResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Recibí el mensaje pero la respuesta vino vacía.';

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: botResponseText.trim(),
        sender: 'kimy',
        timestamp: new Date()
      }]);
    } catch (error: any) {
      console.error("Error al conectar con la IA:", error);
      let fallbackText = '¡Ups! Algo falló al procesar con la IA. Revisa tu conexión e intenta de nuevo.';
      if (error.status === 400) {
        fallbackText = `¡Ay! Algo no anda bien con la IA. No pude procesar tu mensaje, ${username}. 😢 Por favor, intenta de nuevo.`;
      } else if (error.status === 503) {
        fallbackText = `¡Ay! Lo siento mucho, ${username}, pero mis servidores están súper llenos en este momento. 😭 Por fis espera unos segunditos y vuelve a intentarlo. ✨`;
      }
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: fallbackText, sender: 'kimy', timestamp: new Date() }]);
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <NeonAlert />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('chat')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ajustes de Perfil</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.settingsContent}>
          <TouchableOpacity onPress={pickImage}>
            {userPhoto ? (
              <Image source={{ uri: userPhoto }} style={styles.settingsAvatarPreview} />
            ) : (
              <View style={[styles.settingsAvatarPreview, styles.avatarPlaceholder]}>
                <Ionicons name="camera-outline" size={40} color="#666" />
                <Text style={styles.placeholderText}>Subir foto</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Nombre de Usuario</Text>
          <TextInput
            style={styles.settingsInput}
            value={username}
            onChangeText={setUsername}
            placeholder="Escribe tu nombre..."
            placeholderTextColor="#666"
          />
          <TouchableOpacity style={styles.saveButton} onPress={() => setCurrentScreen('chat')}>
            <Text style={styles.saveButtonText}>Guardar y Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <NeonAlert />

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
            <Ionicons name="trash-outline" size={24} color="#FF1493" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentScreen('settings')} style={styles.actionIcon}>
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: keyboardHeight > 0 ? 100 : 20 }]}
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
                    userPhoto ? <Image source={{ uri: userPhoto }} style={styles.chatAvatarRow} />
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
            <ActivityIndicator size="small" color="#FF1493" />
            <Text style={styles.typingText}>Kimy.IA está pensando...</Text>
          </View>
        )}

        <View style={[styles.footer, {
          transform: [{ translateY: keyboardHeight > 0 ? -keyboardHeight : 0 }],
          position: keyboardHeight > 0 ? 'absolute' : 'relative',
          bottom: 0, width: '100%', zIndex: 999
        }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#666"
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isTyping}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, isTyping && { backgroundColor: '#555' }]}
            onPress={sendMessage}
            disabled={isTyping}
          >
            <Ionicons name="send" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  header: 
  { flexDirection: 'row', 
    alignItems: 'center', 
    padding: 15, 
    backgroundColor: '#0a0a0a', 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#FF1493', 
    justifyContent: 'space-between' 
  },
  headerLeft: 
  { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  headerAvatar: 
  { width: 45, 
    height: 45, 
    borderRadius: 22.5, 
    borderWidth: 1, 
    borderColor: '#FF1493' 
  },
  headerTextContainer: 
  { 
    marginLeft: 10 
  },
  headerTitle: 
  { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  headerStatus: 
  { 
    color: '#FF1493', 
    fontSize: 12 
  },
  headerActions: 
  { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  actionIcon: 
  { 
    marginLeft: 15, 
    padding: 5 
  },
  listContent: 
  { 
    padding: 15 
  },
  dateContainer: 
  { 
    alignSelf: 'center', 
    backgroundColor: '#1e1e1e', 
    paddingHorizontal: 12, 
    paddingVertical: 4, 
    borderRadius: 10, 
    marginVertical: 15 
  },
  dateText: 
  { 
    color: '#aaa', 
    fontSize: 12, 
    fontWeight: 'bold' 
  },
  messageRow: 
  { 
    flexDirection: 'row', 
    marginBottom: 12, 
    alignItems: 'flex-end', 
    maxWidth: '85%' 
  },
  userRow: 
  { 
    alignSelf: 'flex-end', 
    flexDirection: 'row-reverse' 
  },
  kimyRow: 
  { 
    alignSelf: 'flex-start' 
  },
  chatAvatarRow: 
  { 
    width: 34, 
    height: 34, 
    borderRadius: 17, 
    marginHorizontal: 8, 
    backgroundColor: '#222' 
  },
  rowPlaceholder: 
  { 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#444' 
  },
  bubble: 
  { 
    padding: 12, 
    borderRadius: 18, 
    maxWidth: '85%' 
  },
  userBubble: 
  { 
    backgroundColor: '#1A1A1A', 
    borderBottomRightRadius: 2, 
    borderWidth: 0.5, 
    borderColor: '#FF1493' 
  },
  kimyBubble: 
  { 
    backgroundColor: '#2D101E', 
    borderBottomLeftRadius: 2 
  },
  usernameTag: 
  { 
    color: '#FF1493', 
    fontSize: 11, 
    fontWeight: 'bold', 
    marginBottom: 3 
  },
  messageText: 
  { 
    color: '#fff', 
    fontSize: 16 
  },
  timeText: 
  { 
    color: '#888', 
    fontSize: 10, 
    alignSelf: 'flex-end', 
    marginTop: 4, 
    textTransform: 'lowercase' 
  },
  typingContainer: 
  { 
    flexDirection: 'row', 
    paddingHorizontal: 20, 
    alignItems: 'center', 
    marginBottom: 10 
  },
  typingText: 
  { 
    color: '#aaa', 
    fontSize: 13, 
    marginLeft: 8 
  },
  footer: 
  { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 10, 
    paddingVertical: 10, 
    backgroundColor: '#000' 
  },
  inputContainer: 
  { 
    flex: 1, 
    flexDirection: 'row', 
    backgroundColor: '#1A1A1A', 
    borderRadius: 25, 
    alignItems: 'center', 
    minHeight: 50, 
    paddingRight: 15 
  },
  input: 
  { 
    flex: 1, 
    color: '#fff', 
    marginLeft: 15, 
    fontSize: 16, 
    maxHeight: 100 
  },
  sendButton: 
  { 
    backgroundColor: '#FF1493', 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 8 
  },
  backButton: 
  { 
    padding: 5 
  },
  settingsContent: 
  { 
    flex: 1, 
    padding: 20, 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: '#000' 
  },
  settingsAvatarPreview: 
  { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    borderWidth: 2, 
    borderColor: '#FF1493', 
    marginBottom: 30 
  },
  avatarPlaceholder: 
  { 
    backgroundColor: '#111', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#FF1493', 
    borderStyle: 'dashed' },
  placeholderText: 
  { 
    color: '#666', 
    fontSize: 12, 
    marginTop: 5 
  },
  label: 
  { 
    color: '#FF1493', 
    alignSelf: 'flex-start', 
    fontSize: 14, fontWeight: 'bold', 
    marginBottom: 8, 
    marginLeft: 5 
  },
  settingsInput: 
  { 
    width: '100%', 
    backgroundColor: '#1A1A1A', 
    color: '#fff', 
    padding: 15, 
    borderRadius: 12, 
    fontSize: 16, 
    marginBottom: 20, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  saveButton: 
  { 
    backgroundColor: '#FF1493', 
    width: '100%', 
    padding: 15, 
    borderRadius: 25, 
    alignItems: 'center', 
    marginTop: 10 
  },
  saveButtonText: 
  { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  alertOverlay: 
  { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.75)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 25 
  },
  alertBox: 
  { 
    width: '100%', 
    backgroundColor: '#0a0a0a', 
    borderRadius: 16, 
    padding: 20, 
    borderWidth: 2, 
    borderColor: '#FF1493', 
    shadowColor: '#FF1493', 
    shadowOffset: 
    { 
      width: 0, 
      height: 0 
    }, 
    shadowOpacity: 0.9, 
    shadowRadius: 15, 
    elevation: 15 
  },
  alertTitle: 
  { 
    color: '#FF1493', 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 10, 
    textAlign: 'center' 
  },
  alertMessage: 
  { 
    color: '#fff', 
    fontSize: 15, 
    marginBottom: 20, 
    textAlign: 'center', 
    lineHeight: 22 
  },
  alertButtonsContainer: 
  { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    gap: 10 
  },
  alertButton: 
  { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 25, 
    backgroundColor: '#1a1a1a', 
    alignItems: 'center', 
    borderWidth: 0.5, 
    borderColor: '#444' 
  },
  alertBtnDestructive: 
  { 
    backgroundColor: '#2d1014', 
    borderColor: '#ff3b30' 
  },
  alertButtonText: 
  { 
    color: '#FF1493', 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
  alertBtnCancelText: 
  { 
    color: '#aaa' 
  }
});