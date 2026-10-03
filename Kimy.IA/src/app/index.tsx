import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StatusBar, Image, ActivityIndicator, Modal, Platform, KeyboardAvoidingView, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../styles'; // Asegúrate de haber movido styles.ts fuera de src/app/

// --- Configuración Dinámica desde Constants (app.json / .env) ---
const getGroqConfig = () => {
  const extra = Constants.expoConfig?.extra || {};
  
  const apiKey = (extra.expoPublicGroqApiKey || process.env.EXPO_PUBLIC_GROQ_API_KEY || "").trim();
  const model = (extra.expoPublicGroqModel || process.env.EXPO_PUBLIC_GROQ_MODEL || "qwen/qwen3.8-27b").trim();

  return { apiKey, model };
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

// ==========================================
// --- FUNCIONES DE HERRAMIENTAS (TOOLS) ---
// ==========================================

const obtenerClimaCiudad = async (ciudad: string): Promise<string> => {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`);
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return `No se encontró información para la ubicación "${ciudad}".`;
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
    const weatherData = await weatherRes.json();

    const temp = weatherData.current?.temperature_2m;
    const humedad = weatherData.current?.relative_humidity_2m;
    const viento = weatherData.current?.wind_speed_10m;

    return JSON.stringify({
      ciudad: name,
      pais: country,
      temperatura: `${temp}°C`,
      humedad: `${humedad}%`,
      viento: `${viento} km/h`
    });
  } catch (error) {
    return "No se pudo consultar el clima en este momento.";
  }
};

const obtenerHoraActual = () => {
  const ahora = new Date();
  return JSON.stringify({
    fecha_actual: format(ahora, "d 'de' MMMM 'de' yyyy", { locale: es }),
    hora_actual: format(ahora, "hh:mm:ss a"),
    zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
};

const groqTools = [
  {
    type: "function",
    function: {
      name: "obtenerClimaCiudad",
      description: "Obtiene el clima actual, temperatura, humedad y vientos de una ciudad específica del mundo.",
      parameters: {
        type: "object",
        properties: {
          ciudad: { type: "string", description: "Nombre de la ciudad (ej. 'Aguascalientes', 'Madrid')" }
        },
        required: ["ciudad"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obtenerHoraActual",
      description: "Obtiene la fecha actual, la hora exacta en tiempo real y la zona horaria.",
      parameters: { type: "object", properties: {} }
    }
  }
];

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

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setToastMessage(null));
    }, 3500);
  };

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
    showToast("¡Foto de perfil actualizada con éxito!");
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
      "Limpiar conversación",
      "¿Deseas borrar los mensajes actuales y empezar de nuevo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, limpiar",
          style: "destructive",
          onPress: async () => {
            const initialMsg: Message[] = [{ id: Date.now().toString(), text: '¡Conversación reiniciada! ¿En qué te puedo ayudar?', sender: 'kimy', timestamp: new Date() }];
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
      showToast("Se necesitan permisos de galería para cambiar la foto.");
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
    
    const { apiKey, model } = getGroqConfig();
    if (!apiKey) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: "¡Hola! Por favor configura tu API Key de Groq en app.json o .env para continuar.",
        sender: 'kimy',
        timestamp: new Date()
      }]);
      setInputText('');
      return;
    }

    const userText = inputText;
    const newMessage: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: new Date() };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const systemPrompt = `Eres Kimy.IA, una asistente virtual en español amigable, empática, educada y servicial desarrollada sobre Qwen. Te estás comunicando con ${username}. Tienes acceso a herramientas para consultar el clima actual y la hora en tiempo real. Si el usuario te pide información meteorológica o la hora actual, usa las herramientas correspondientes.`;

      let apiMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.slice(-8).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ];

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: apiMessages,
            tools: groqTools,
            tool_choice: "auto",
            max_tokens: 800,
            temperature: 0.7
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Detalle del error de la API:", errorBody);
        throw new Error("Error de comunicación con el servicio.");
      }

      const data = await response.json();
      const responseMessage = data.choices?.[0]?.message;

      let botResponseText = "";

      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolCall = responseMessage.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

        let toolResult = "";
        if (functionName === "obtenerClimaCiudad") {
          toolResult = await obtenerClimaCiudad(functionArgs.ciudad);
        } else if (functionName === "obtenerHoraActual") {
          toolResult = obtenerHoraActual();
        }

        apiMessages.push(responseMessage);
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: toolResult,
        });

        const secondResponse = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: apiMessages,
              max_tokens: 800,
              temperature: 0.7
            })
          }
        );

        const secondData = await secondResponse.json();
        botResponseText = secondData.choices?.[0]?.message?.content || 'Lo siento, no pude procesar los datos en este momento.';
      } else {
        botResponseText = responseMessage?.content || 'Lo siento, no recibí una respuesta válida.';
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: botResponseText.trim(),
        sender: 'kimy',
        timestamp: new Date()
      }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        text: 'Vaya, tuve un pequeño problema de conexión en este momento. Inténtalo de nuevo en unos segundos.', 
        sender: 'kimy', 
        timestamp: new Date() 
      }]);
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

  const ToastNotification = () => {
    if (!toastMessage) return null;
    return (
      <Animated.View style={[styles.toastContainer, { opacity: toastAnim }]}>
        <Ionicons name="information-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>
    );
  };

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

          <Text style={styles.label}>Tu Nombre</Text>
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
        <ToastNotification />
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
            <Text style={styles.headerStatus}>en línea (Qwen)</Text>
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
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.typingText}>Kimy.IA está escribiendo...</Text>
            </View>
          )}

          <View style={styles.footer}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Hazme una pregunta..."
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={inputText}
                onChangeText={inputText => setInputText(inputText)}
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
      <ToastNotification />
    </SafeAreaView>
  );
}