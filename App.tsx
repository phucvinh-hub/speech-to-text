import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GiftedChat, IMessage, InputToolbar, Composer } from 'react-native-gifted-chat';
import { View, StyleSheet, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function App() {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordTime, setRecordTime] = useState('00:00');
  const [audioData, setAudioData] = useState<number[]>(Array(80).fill(0));
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [recordedAudioData, setRecordedAudioData] = useState<number[]>([]);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    setMessages(previousMessages =>
      GiftedChat.append(previousMessages, newMessages)
    );
  }, []);

  const recordingOptions: Audio.RecordingOptions = {
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    ios: {
      extension: '.m4a',
      audioQuality: Audio.IOSAudioQuality.MAX,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };

  const resetRecordingState = () => {
    setRecordTime('00:00');
    setAudioData(Array(80).fill(0));
    setRecordedAudioData([]);
    setPlaybackProgress(0);
  };

  const startRecording = async () => {
    try {
      resetRecordingState();
      
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status === "granted") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true
        });

        const { recording } = await Audio.Recording.createAsync(
          {
            ...recordingOptions,
            isMeteringEnabled: true
          },
          (status) => {
            if (status.isRecording && status.metering !== undefined) {
              const db = 20 * Math.log10(Math.abs(status.metering));
              
              const maxQuietDb = 33;
              const minVoiceDb = 5;
              const amplificationFactor = 1.2;
              
              let normalizedValue = Math.max((maxQuietDb - db) / (maxQuietDb - minVoiceDb), 0);
              normalizedValue = Math.min(normalizedValue * amplificationFactor, 1);
              
              const minAmplitude = 0.05;
              normalizedValue = Math.max(normalizedValue, minAmplitude);
              
              setAudioData(prevData => {
                const newData = [...prevData.slice(1), normalizedValue];
                setRecordedAudioData(newData);
                return newData;
              });
            }
          },
          50
        );

        setRecording(recording);
        setIsRecording(true);
        setIsModalVisible(true);

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        let seconds = 0;
        const timer = setInterval(() => {
          seconds++;
          const minutes = Math.floor(seconds / 60);
          const remainingSeconds = seconds % 60;
          setRecordTime(
            `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
          );
        }, 1000);

        timerRef.current = timer;
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        await convertAudioToText(uri);
      }
      setRecording(null);
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const convertAudioToText = async (audioUri: string) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'speech.m4a',
      } as any);

      const response = await fetch('https://api.mekong-connector.co/rs/transcribe', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'Ocp-Apim-Subscription-Key': 'da9d27fc4e9f417a94850723db2d5fd4'
        },
      });

      const data = await response.json();
      console.log(data);
      if (data.transcript) {
        setInputText(data.transcript);
      }
    } catch (error) {
      console.error('Error converting audio to text:', error);
    } finally {
      setIsModalVisible(false);
    }
  };

  const renderInputToolbar = (props: any) => {
    return (
      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbar}
        renderComposer={(composerProps) => (
          <View style={styles.composerContainer}>
            <Pressable style={styles.micButton} onPress={startRecording}>
              <MaterialIcons name="mic" size={24} color="#007AFF" />
            </Pressable>
            <Composer 
              {...composerProps} 
              text={inputText}
              onTextChanged={text => setInputText(text)}
            />
          </View>
        )}
      />
    );
  };

  const renderAudioWaveform = () => {
    const dataToRender = isRecording ? audioData : recordedAudioData;
    const totalBars = 80;

    return Array(totalBars).fill(0).map((_, index) => {
      let value = 0;
      const dataIndex = Math.floor(((totalBars - 1 - index) / totalBars) * dataToRender.length);

      if (dataToRender[dataIndex] !== undefined) {
        value = dataToRender[dataIndex];
      }

      const minHeight = 3;
      const maxHeight = 100;
      const height = Math.max(value * 100, minHeight);

      return (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: `${Math.min(height, maxHeight)}%`,
              marginHorizontal: 1,
              opacity: !isRecording && index / totalBars > playbackProgress ? 0.3 : 1,
            }
          ]}
        >
          <LinearGradient
            colors={['#4c669f', '#3b5998', '#192f6a']}
            style={{ flex: 1 }}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </View>
      );
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <GiftedChat
          messages={messages}
          onSend={messages => onSend(messages)}
          user={{ _id: 1 }}
          renderInputToolbar={renderInputToolbar}
        />
        
        <Modal 
          visible={isModalVisible} 
          style={styles.modal}
          animationType="slide"
          transparent={true}
          statusBarTranslucent={true}
          hardwareAccelerated={true}
          onRequestClose={() => {}}
        >
          <View 
            style={[styles.modalOverlay, StyleSheet.absoluteFillObject]}
          >
            <View style={styles.modalContent}>
              <View style={styles.waveformContainer}>
                {renderAudioWaveform()}
              </View>
              <Text style={styles.recordingTime}>{recordTime}</Text>
              <Text style={styles.recordingModeText}>
                {isRecording ? 'Đang ghi âm...' : 'Đã ghi âm'}
              </Text>
              <Pressable
                style={styles.stopButton}
                onPress={stopRecording}
              >
                <MaterialIcons name="check-circle" size={40} color="#007AFF" />
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inputToolbar: {
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  micButton: {
    padding: 8,
  },
  modal: {
    margin: 0,
  },
  modalOverlay: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: 'white',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    width: '100%',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    width: '100%',
    marginBottom: 20,
    backgroundColor: '#F0F0F0',
    borderRadius: 30,
    overflow: 'hidden',
    padding: 5,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 1,
    overflow: 'hidden',
  },
  recordingTime: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  recordingModeText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  stopButton: {
    padding: 15,
  },
});
