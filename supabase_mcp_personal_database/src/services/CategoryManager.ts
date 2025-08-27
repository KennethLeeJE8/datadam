import { SupabaseClient } from '@supabase/supabase-js';
import { logger, ErrorCategory } from '../utils/logger.js';

export interface CategoryInfo {
  name: string;
  displayName: string;
  description: string;
  isActive: boolean;
  itemCount: number;
  triggerWords: string[];
  queryHint: string;
  exampleQueries: string[];
  lastModified: Date;
}

export interface CategoryStats {
  totalCategories: number;
  activeCategories: number;
  totalItems: number;
  activeCategoryList: CategoryInfo[];
  allCategories: CategoryInfo[];
  lastUpdated: Date;
}

export interface ContextualHint {
  category: string;
  displayName: string;
  itemCount: number;
  triggerWords: string[];
  queryHint: string;
}

/**
 * CategoryManager handles dynamic category discovery for MCP endpoints only.
 * It provides contextual information about what data is available and when
 * AI agents should query specific categories.
 */
export class CategoryManager {
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(private supabase: SupabaseClient) {}
  
  /**
   * Initialize the category manager and warm up the cache
   */
  async initialize(): Promise<void> {
    logger.info('Initializing CategoryManager');
    try {
      await this.refreshCache();
      logger.info('CategoryManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CategoryManager', error as Error, ErrorCategory.SYSTEM);
      throw error;
    }
  }
  
  /**
   * Get all currently active categories (categories with data)
   */
  async getActiveCategories(): Promise<CategoryInfo[]> {
    const cacheKey = 'active_categories';
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      logger.debug('Returning active categories from cache');
      return cached;
    }
    
    logger.debug('Fetching active categories from database');
    
    try {
      const { data, error } = await this.supabase.rpc('get_active_categories');
      
      if (error) {
        logger.error('Failed to fetch active categories', error as Error, ErrorCategory.DATABASE);
        throw new Error(`Database error: ${error.message}`);
      }
      
      const categories = data.map((row: any) => this.mapToCategory(row));
      this.setCache(cacheKey, categories);
      
      logger.debug('Active categories fetched successfully', { count: categories.length });
      return categories;
    } catch (error) {
      logger.error('Error getting active categories', error as Error, ErrorCategory.DATABASE);
      throw error;
    }
  }
  
  /**
   * Get information about a specific category
   */
  async getCategoryStatus(categoryName: string): Promise<CategoryInfo | null> {
    const cacheKey = `category_${categoryName}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('category_registry')
        .select('*')
        .eq('category_name', categoryName)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null;
        }
        logger.error('Failed to fetch category status', error as Error, ErrorCategory.DATABASE, { categoryName });
        throw new Error(`Database error: ${error.message}`);
      }
      
      const category = this.mapToCategory(data);
      this.setCache(cacheKey, category);
      return category;
    } catch (error) {
      logger.error('Error getting category status', error as Error, ErrorCategory.DATABASE, { categoryName });
      throw error;
    }
  }
  
  /**
   * Check if a specific category is active (has data)
   */
  async isCategoryAvailable(categoryName: string): Promise<boolean> {
    const category = await this.getCategoryStatus(categoryName);
    return category?.isActive || false;
  }
  
  /**
   * Get list of active category names for tool enum values
   */
  async getActiveCategoryEnum(): Promise<string[]> {
    const categories = await this.getActiveCategories();
    return categories.map(c => c.name);
  }
  
  /**
   * Get comprehensive category statistics
   */
  async getCategoryStats(): Promise<CategoryStats> {
    const cacheKey = 'category_stats';
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      const { data, error } = await this.supabase.rpc('get_category_stats');
      
      if (error) {
        logger.error('Failed to fetch category stats', error as Error, ErrorCategory.DATABASE);
        throw new Error(`Database error: ${error.message}`);
      }
      
      const row = data[0];
      const categoriesData = row.categories_json || [];
      
      const allCategories = categoriesData.map((cat: any) => ({
        name: cat.name,
        displayName: cat.display_name,
        description: cat.description || '',
        isActive: cat.is_active,
        itemCount: cat.item_count,
        triggerWords: cat.trigger_words || [],
        queryHint: cat.query_hint || '',
        exampleQueries: cat.example_queries || [],
        lastModified: new Date()
      }));
      
      const stats: CategoryStats = {
        totalCategories: row.total_categories,
        activeCategories: row.active_categories,
        totalItems: row.total_items,
        activeCategoryList: allCategories.filter((c: CategoryInfo) => c.isActive),
        allCategories: allCategories,
        lastUpdated: new Date()
      };
      
      this.setCache(cacheKey, stats);
      logger.debug('Category stats fetched successfully', { 
        total: stats.totalCategories, 
        active: stats.activeCategories 
      });
      
      return stats;
    } catch (error) {
      logger.error('Error getting category stats', error as Error, ErrorCategory.DATABASE);
      throw error;
    }
  }
  
  /**
   * Generate contextual hints for AI agents about when to query categories
   */
  async getContextualHints(): Promise<ContextualHint[]> {
    const activeCategories = await this.getActiveCategories();
    
    return activeCategories.map(category => ({
      category: category.name,
      displayName: category.displayName,
      itemCount: category.itemCount,
      triggerWords: category.triggerWords,
      queryHint: category.queryHint
    }));
  }
  
  /**
   * Generate a summary string for tool descriptions
   */
  async generateActiveDataSummary(): Promise<string> {
    const activeCategories = await this.getActiveCategories();
    
    if (activeCategories.length === 0) {
      return 'No personal data available yet. Start adding data to enable this feature.';
    }
    
    const categorySummaries = activeCategories
      .map((c: CategoryInfo) => `${c.displayName} (${c.itemCount} item${c.itemCount !== 1 ? 's' : ''})`)
      .join(', ');
    
    return `Available data categories: ${categorySummaries}`;
  }
  
  /**
   * Generate trigger word hints for tool descriptions
   */
  async generateTriggerWordHints(): Promise<string> {
    const activeCategories = await this.getActiveCategories();
    
    if (activeCategories.length === 0) {
      return '';
    }
    
    const allTriggerWords = activeCategories
      .flatMap(c => c.triggerWords.slice(0, 3)) // Take first 3 trigger words per category
      .slice(0, 10); // Limit total to 10 words to keep descriptions concise
    
    if (allTriggerWords.length === 0) {
      return '';
    }
    
    return `Query when user mentions: ${allTriggerWords.join(', ')}`;
  }
  
  /**
   * Detect which category a piece of content should belong to based on trigger words
   */
  async detectCategoryFromContent(dataType: string, title: string, content: any): Promise<string | null> {
    const allCategories = (await this.getCategoryStats()).allCategories;
    
    const searchText = `${dataType} ${title} ${JSON.stringify(content)}`.toLowerCase();
    
    // Direct data type mapping
    const directMapping: Record<string, string> = {
      'contact': 'contacts',
      'document': 'documents',
      'preference': 'preferences',
      'custom': 'basic_information'
    };
    
    if (directMapping[dataType]) {
      return directMapping[dataType];
    }
    
    // Search through categories by trigger words
    for (const category of allCategories) {
      for (const triggerWord of category.triggerWords) {
        if (searchText.includes(triggerWord.toLowerCase())) {
          logger.debug('Category detected by trigger word', { 
            category: category.name, 
            triggerWord,
            dataType,
            title
          });
          return category.name;
        }
      }
    }
    
    // Fallback to basic_information
    logger.debug('No specific category detected, using basic_information', { dataType, title });
    return 'basic_information';
  }
  
  /**
   * Clear the entire cache
   */
  async refreshCache(): Promise<void> {
    this.cache.clear();
    logger.debug('Category cache refreshed');
  }
  
  /**
   * Map database row to CategoryInfo
   */
  private mapToCategory(data: any): CategoryInfo {
    return {
      name: data.category_name,
      displayName: data.display_name,
      description: data.description || '',
      isActive: data.is_active,
      itemCount: data.item_count,
      triggerWords: data.trigger_words || [],
      queryHint: data.query_hint || '',
      exampleQueries: data.example_queries || [],
      lastModified: new Date(data.last_modified)
    };
  }
  
  /**
   * Get data from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  /**
   * Store data in cache with TTL
   */
  private setCache(key: string, value: any): void {
    this.cache.set(key, {
      data: value,
      expires: Date.now() + this.cacheTTL
    });
  }
}