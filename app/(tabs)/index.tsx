import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert,
  Platform,
  Animated,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useUserStore } from '@/store/userStore';
import { useNutritionStore } from '@/store/nutritionStore';
import Card from '@/components/Card';
import Button from '@/components/Button';
import LogMealForm from '@/components/LogMealForm';
import MealCard from '@/components/MealCard';
import AvatarEmoji from '@/components/AvatarEmoji';
import { MealEntry } from '@/types';
import { getPersonalizedGreeting, getMotivationalMessage } from '@/utils/aiService';
import { Plus, TrendingUp, Calendar, Target, Utensils, Award } from 'lucide-react-native';

export default function HomeScreen() {
  const { colors } = useTheme();
  const profile = useUserStore((state) => state.profile);
  const calculateBMI = useUserStore((state) => state.calculateBMI);
  const { 
    mealEntries, 
    addMealEntry, 
    avatarMood, 
    setAvatarMood, 
    determineAvatarMood 
  } = useNutritionStore();
  
  const [showLogMeal, setShowLogMeal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [showAvatarMessage, setShowAvatarMessage] = useState(true);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [avatarScale] = useState(new Animated.Value(0));
  const [streakCount, setStreakCount] = useState(0);
  
  const screenWidth = Dimensions.get('window').width;
  const avatarRef = useRef(null);
  
  // Get today's meals
  const today = new Date().toISOString().split('T')[0];
  const todayMeals = mealEntries.filter(meal => meal.date === today);
  
  // Calculate today's nutrition
  const todayCalories = todayMeals.reduce((sum, meal) => sum + meal.totalCalories, 0);
  const todayProtein = todayMeals.reduce((sum, meal) => sum + meal.totalProtein, 0);
  const todayCarbs = todayMeals.reduce((sum, meal) => sum + meal.totalCarbs, 0);
  const todayFat = todayMeals.reduce((sum, meal) => sum + meal.totalFat, 0);
  
  // Calculate recommended calories
  const getRecommendedCalories = () => {
    if (!profile) return 2000;
    
    let bmr = 0;
    if (profile.gender === 'male') {
      bmr = 88.362 + (13.397 * profile.weight) + (4.799 * profile.height) - (5.677 * profile.age);
    } else {
      bmr = 447.593 + (9.247 * profile.weight) + (3.098 * profile.height) - (4.330 * profile.age);
    }
    
    let activityMultiplier = 1.2;
    if (profile.exerciseDuration >= 60) {
      activityMultiplier = 1.725;
    } else if (profile.exerciseDuration >= 30) {
      activityMultiplier = 1.55;
    } else if (profile.exerciseDuration >= 15) {
      activityMultiplier = 1.375;
    }
    
    let tdee = bmr * activityMultiplier;
    
    if (profile.goal === 'weight_loss') {
      tdee -= 500;
    } else if (profile.goal === 'weight_gain') {
      tdee += 500;
    }
    
    return Math.round(tdee);
  };
  
  const recommendedCalories = getRecommendedCalories();
  const calorieProgress = (todayCalories / recommendedCalories) * 100;
  
  // Calculate streak count
  useEffect(() => {
    const calculateStreak = () => {
      const sortedEntries = [...mealEntries].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      if (sortedEntries.length === 0) return 0;
      
      let streak = 0;
      let currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      
      // Check if there's an entry for today
      const todayEntry = sortedEntries.find(entry => 
        new Date(entry.date).getTime() === currentDate.getTime()
      );
      
      if (todayEntry) {
        streak = 1;
        
        // Check consecutive days before today
        let checkDate = new Date(currentDate);
        checkDate.setDate(checkDate.getDate() - 1);
        
        while (true) {
          const dateString = checkDate.toISOString().split('T')[0];
          const hasEntry = sortedEntries.some(entry => entry.date === dateString);
          
          if (hasEntry) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      } else {
        // Check if there was an entry yesterday
        let yesterdayDate = new Date(currentDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayString = yesterdayDate.toISOString().split('T')[0];
        
        const yesterdayEntry = sortedEntries.find(entry => 
          entry.date === yesterdayString
        );
        
        if (yesterdayEntry) {
          streak = 1;
          
          // Check consecutive days before yesterday
          let checkDate = new Date(yesterdayDate);
          checkDate.setDate(checkDate.getDate() - 1);
          
          while (true) {
            const dateString = checkDate.toISOString().split('T')[0];
            const hasEntry = sortedEntries.some(entry => entry.date === dateString);
            
            if (hasEntry) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        }
      }
      
      return streak;
    };
    
    setStreakCount(calculateStreak());
  }, [mealEntries]);
  
  // Update avatar mood based on current state
  useEffect(() => {
    if (profile) {
      const bmi = calculateBMI();
      const newMood = determineAvatarMood(bmi, todayCalories, profile.goal);
      setAvatarMood(newMood);
    }
  }, [profile, todayCalories, calculateBMI, determineAvatarMood, setAvatarMood]);
  
  // Animate avatar entrance
  useEffect(() => {
    Animated.spring(avatarScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [avatarScale]);
  
  // Load personalized greeting
  useEffect(() => {
    const loadGreeting = async () => {
      if (profile) {
        try {
          const personalizedGreeting = await getPersonalizedGreeting(profile, avatarMood);
          setGreeting(personalizedGreeting);
          setAvatarMessage(personalizedGreeting);
          
          // Speak the greeting on first load if on native platform
          if (Platform.OS !== 'web' && !isSpeaking) {
            speakMessage(personalizedGreeting);
          }
        } catch (error) {
          console.error('Error loading greeting:', error);
          const defaultGreeting = `Hello ${profile.name}! 😊 Ready to continue your wellness journey today?`;
          setGreeting(defaultGreeting);
          setAvatarMessage(defaultGreeting);
          
          // Speak the default greeting if on native platform
          if (Platform.OS !== 'web' && !isSpeaking) {
            speakMessage(defaultGreeting);
          }
        }
      }
    };
    
    loadGreeting();
  }, [profile, avatarMood]);
  
  const speakMessage = (text: string) => {
    if (Platform.OS === 'web') return;
    
    if (isSpeaking) {
      // This would use Speech.stop() if expo-speech was available
    }
    
    setIsSpeaking(true);
    
    // Clean up text for speech (remove emojis, etc.)
    const cleanText = text.replace(/[^\x00-\x7F]/g, "").trim();
    
    // This would use Speech.speak() if expo-speech was available
    // For now, just simulate speaking
    setTimeout(() => {
      setIsSpeaking(false);
    }, 3000);
  };
  
  const handleLogMeal = (meal: MealEntry) => {
    addMealEntry(meal);
    setShowLogMeal(false);
    
    // Update avatar mood based on the meal logged
    if (profile) {
      const bmi = calculateBMI();
      const newTotalCalories = todayCalories + meal.totalCalories;
      const newMood = determineAvatarMood(bmi, newTotalCalories, profile.goal);
      setAvatarMood(newMood);
      
      // Generate and speak a response about the meal
      const mealResponse = `Great job logging your ${meal.mealType}! I've added ${meal.foods[0].name} to your daily nutrition.`;
      setAvatarMessage(mealResponse);
      setShowAvatarMessage(true);
      
      if (Platform.OS !== 'web') {
        speakMessage(mealResponse);
      }
    }
  };
  
  const handleAvatarPress = async () => {
    if (!profile) return;
    
    try {
      const context = `User has consumed ${todayCalories} calories today out of ${recommendedCalories} recommended. They have logged ${todayMeals.length} meals. Their current streak is ${streakCount} days.`;
      const motivationalMessage = await getMotivationalMessage(profile, context);
      setAvatarMessage(motivationalMessage);
      setShowAvatarMessage(true);
      
      // Set a positive mood when user interacts
      setAvatarMood('joyful');
      
      // Speak the motivational message if on native platform
      if (Platform.OS !== 'web') {
        speakMessage(motivationalMessage);
      }
    } catch (error) {
      console.error('Error getting motivational message:', error);
      const defaultMessage = "You're doing amazing! Keep up the great work with your health journey! 🌟💪";
      setAvatarMessage(defaultMessage);
      setShowAvatarMessage(true);
      
      // Speak the default message if on native platform
      if (Platform.OS !== 'web') {
        speakMessage(defaultMessage);
      }
    }
  };
  
  const onRefresh = async () => {
    setRefreshing(true);
    
    // Reload greeting and update avatar mood
    if (profile) {
      try {
        const bmi = calculateBMI();
        const newMood = determineAvatarMood(bmi, todayCalories, profile.goal);
        setAvatarMood(newMood);
        
        const personalizedGreeting = await getPersonalizedGreeting(profile, newMood);
        setGreeting(personalizedGreeting);
        setAvatarMessage(personalizedGreeting);
        setShowAvatarMessage(true);
        
        // Speak the greeting if on native platform
        if (Platform.OS !== 'web') {
          speakMessage(personalizedGreeting);
        }
      } catch (error) {
        console.error('Error refreshing:', error);
      }
    }
    
    setRefreshing(false);
  };
  
  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            Welcome! Please complete your profile setup to get started.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header with Avatar */}
        <View style={styles.header}>
          <View style={styles.welcomeSection}>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>
              Welcome back,
            </Text>
            <Text style={[styles.userName, { color: colors.text }]}>
              {profile.name}! 👋
            </Text>
          </View>
          
          <Animated.View 
            style={{ 
              transform: [{ scale: avatarScale }],
              alignItems: 'center'
            }}
            ref={avatarRef}
          >
            <AvatarEmoji
              mood={avatarMood}
              size="xxlarge"
              interactive={true}
              onPress={handleAvatarPress}
              showMessage={showAvatarMessage}
              message={avatarMessage}
            />
          </Animated.View>
          
          {/* Streak Counter */}
          {streakCount > 0 && (
            <View style={[styles.streakContainer, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
              <Award size={16} color={colors.primary} />
              <Text style={[styles.streakText, { color: colors.primary }]}>
                {streakCount} Day{streakCount !== 1 ? 's' : ''} Streak! 🔥
              </Text>
            </View>
          )}
        </View>
        
        {/* Quick Stats */}
        <Card style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <TrendingUp size={20} color={colors.primary} />
            <Text style={[styles.statsTitle, { color: colors.text }]}>Today's Progress</Text>
          </View>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {todayCalories}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Calories
              </Text>
              <Text style={[styles.statTarget, { color: colors.textSecondary }]}>
                / {recommendedCalories}
              </Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>
                {Math.round(todayProtein)}g
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Protein
              </Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {todayMeals.length}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Meals
              </Text>
            </View>
          </View>
          
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${Math.min(calorieProgress, 100)}%`,
                    backgroundColor: calorieProgress > 110 ? colors.warning : colors.primary
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {Math.round(calorieProgress)}% of daily goal
            </Text>
          </View>
        </Card>
        
        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowLogMeal(true)}
          >
            <Plus size={20} color="white" />
            <Text style={styles.actionButtonText}>Log Meal</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.secondary }]}
            onPress={() => Alert.alert('Coming Soon', 'Meal planning feature coming soon!')}
          >
            <Calendar size={20} color="white" />
            <Text style={styles.actionButtonText}>Plan Meals</Text>
          </TouchableOpacity>
        </View>
        
        {/* Recent Meals */}
        <Card style={styles.mealsCard}>
          <View style={styles.mealsHeader}>
            <Utensils size={20} color={colors.primary} />
            <Text style={[styles.mealsTitle, { color: colors.text }]}>Today's Meals</Text>
          </View>
          
          {todayMeals.length > 0 ? (
            <View style={styles.mealsList}>
              {todayMeals.slice(0, 3).map((meal) => (
                <MealCard key={meal.id} meal={meal} />
              ))}
              {todayMeals.length > 3 && (
                <Text style={[styles.moreText, { color: colors.textSecondary }]}>
                  +{todayMeals.length - 3} more meals
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.emptyMeals}>
              <Text style={[styles.emptyMealsText, { color: colors.textSecondary }]}>
                No meals logged today. Start by logging your first meal!
              </Text>
              <Button
                title="Log Your First Meal"
                onPress={() => setShowLogMeal(true)}
                style={styles.firstMealButton}
              />
            </View>
          )}
        </Card>
        
        {/* Health Tip */}
        <Card style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Target size={20} color={colors.success} />
            <Text style={[styles.tipTitle, { color: colors.text }]}>Daily Tip</Text>
          </View>
          <Text style={[styles.tipText, { color: colors.textSecondary }]}>
            {greeting || "Stay hydrated! Aim for 8 glasses of water throughout the day to support your metabolism and overall health. 💧"}
          </Text>
        </Card>
      </ScrollView>
      
      {/* Log Meal Modal */}
      {showLogMeal && (
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Log New Meal</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowLogMeal(false)}
              >
                <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <LogMealForm onSubmit={handleLogMeal} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 16,
    marginBottom: 4,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  statsCard: {
    marginBottom: 20,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
  },
  statTarget: {
    fontSize: 12,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  mealsCard: {
    marginBottom: 20,
  },
  mealsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  mealsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  mealsList: {
    gap: 12,
  },
  moreText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyMeals: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyMealsText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  firstMealButton: {
    paddingHorizontal: 24,
  },
  tipCard: {
    marginBottom: 20,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  tipText: {
    fontSize: 16,
    lineHeight: 22,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});