import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GiftedChat, IMessage, InputToolbar, Composer } from 'react-native-gifted-chat';
import { View, StyleSheet, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Thay đổi interface AudioMessage
type AudioMessage = IMessage & {
  audioWaveform?: {
    waveform: number[];
    duration: string;
  };
};

export default function App() {
  const [messages, setMessages] = useState<AudioMessage[]>([]);
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
      GiftedChat.append(previousMessages as AudioMessage[], newMessages as AudioMessage[])
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
      
      onSend([{
        _id: Math.random().toString(),
        createdAt: new Date(),
        user: { _id: 1 },
        audio: uri || '', 
        audioWaveform: {
          waveform: recordedAudioData,
          duration: recordTime
        }
      } as AudioMessage]);

      if (uri) {
        await convertAudioToText(uri);
      }
      setRecording(null);
      setIsModalVisible(false);
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
      // if (data.transcript) {
      //   setInputText(data.transcript);
      // }
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
            <Pressable 
              style={[styles.sendButton, !inputText && styles.sendButtonDisabled]} 
              onPress={() => {
                if (inputText.trim()) {
                  onSend([{
                    _id: Math.random().toString(),
                    text: inputText,
                    createdAt: new Date(),
                    user: { _id: 1 }
                  }]);
                  setInputText('');
                }
              }}
            >
              <MaterialIcons 
                name="send" 
                size={24} 
                color={inputText ? "#007AFF" : "#B8B8B8"} 
              />
            </Pressable>
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

  const AudioBubble = ({ message, position }: { message: AudioMessage, position: 'left' | 'right' }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState('00:00');
    const [progress, setProgress] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    const startPlayback = async () => {
      try {
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: message.audio || '' },
          { shouldPlay: true }
        );
        
        soundRef.current = sound;
        setIsPlaying(true);
        setCurrentTime('00:00');
        setProgress(0);
        
        let seconds = 0;
        const totalSeconds = parseInt(message.audioWaveform?.duration?.split(':')[0] || '0') * 60 + 
                            parseInt(message.audioWaveform?.duration?.split(':')[1] || '0');
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.positionMillis && status.durationMillis) {
            const currentSeconds = Math.floor(status.positionMillis / 1000);
            const minutes = Math.floor(currentSeconds / 60);
            const remainingSeconds = currentSeconds % 60;
            setCurrentTime(
              `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
            );
            setProgress(status.positionMillis / status.durationMillis);

            if (status.didJustFinish) {
              stopPlayback();
            }
          }
        });
      } catch (error) {
        console.error('Error playing sound:', error);
      }
    };

    const stopPlayback = async () => {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsPlaying(false);
      setProgress(0);
    };

    useEffect(() => {
      return () => {
        if (soundRef.current) {
          soundRef.current.unloadAsync();
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }, []);

    if (!message.audioWaveform) return null;

    const isRight = position === 'right';
    const activeColor = isRight ? '#FFFFFF' : '#007AFF';
    const inactiveColor = isRight ? 'rgba(255,255,255,0.5)' : 'rgba(0,122,255,0.5)';

    return (
      <View style={[
        styles.audioBubble,
        isRight ? styles.bubbleRight : styles.bubbleLeft
      ]}>
        <View style={styles.audioControls}>
          <TouchableOpacity 
            onPress={isPlaying ? stopPlayback : startPlayback}
            style={styles.playButton}
          >
            <MaterialIcons 
              name={isPlaying ? "stop" : "play-arrow"} 
              size={24} 
              color={activeColor} 
            />
          </TouchableOpacity>
          
          <View style={styles.audioContent}>
            <View style={styles.audioWaveformContainer}>
              {message.audioWaveform.waveform
                .filter((_, i) => i % 3 === 0)
                .slice(0, 30)
                .map((value, index) => {
                  const height = Math.max(value * 40, 3);
                  const isPlayed = (index / 30) <= progress;
                  
                  return (
                    <View
                      key={index}
                      style={[
                        styles.audioBar,
                        {
                          height,
                          backgroundColor: isPlayed ? activeColor : inactiveColor
                        }
                      ]}
                    />
                  );
                })}
            </View>
            
            <Text style={[
              styles.audioDuration,
              isRight ? styles.audioTextRight : styles.audioTextLeft
            ]}>
              {isPlaying ? currentTime : message.audioWaveform.duration}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <GiftedChat
          messages={messages}
          onSend={messages => onSend(messages)}
          user={{ _id: 1 }}
          renderInputToolbar={renderInputToolbar}
          renderBubble={(props) => {
            const message = props.currentMessage as AudioMessage;
            if (message.audioWaveform) {
              return <AudioBubble message={message} position={props.position} />;
            }
            return (
              <View style={[
                styles.bubble,
                props.position === 'right' ? styles.bubbleRight : styles.bubbleLeft
              ]}>
                <Text style={[
                  styles.messageText,
                  props.position === 'right' ? styles.messageTextRight : styles.messageTextLeft
                ]}>
                  {props.currentMessage?.text}
                </Text>
              </View>
            );
          }}
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
  sendButton: {
    padding: 8,
    marginLeft: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 5,
  },
  bubbleRight: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 5,
    marginLeft: 60,
  },
  bubbleLeft: {
    backgroundColor: '#E8E8E8',
    borderBottomLeftRadius: 5,
    marginRight: 60,
  },
  messageText: {
    fontSize: 16,
  },
  messageTextRight: {
    color: '#FFFFFF',
  },
  messageTextLeft: {
    color: '#000000',
  },
  audioBubble: {
    width: "50%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    // marginBottom: 5,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,

  },
  audioContent: {
    flex: 1,
    width: '100%',
  },
  audioWaveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    marginTop: 4,
    width: '100%',
  },
  audioBar: {
    width: 2,
    marginHorizontal: 1,
    borderRadius: 1,
  },
  audioDuration: {
    fontSize: 12,
    marginTop: 4,
  },
  audioTextRight: {
    color: '#FFFFFF',
    textAlign: 'right',
  },
  audioTextLeft: {
    color: '#666666',
    textAlign: 'left',
  }
});
