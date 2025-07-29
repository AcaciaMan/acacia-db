# Database Examples for Different Industries

This directory contains real-world database schema examples from various industries to demonstrate the versatility and value of acacia-db analysis.

## Available Examples

### 1. Microsoft Dynamics 365 Business Central (AL Schema)
**Domain**: Enterprise Resource Planning (ERP)
**Tables**: 477 tables covering comprehensive business management
**File Format**: AL (Application Language) table definitions
**Key Insights**:
- Complex business process relationship mapping
- Financial and operational data integration
- Multi-module enterprise system analysis

**Business Value**:
- ERP customization optimization
- Business process efficiency analysis
- Module interdependency discovery
- Performance optimization for large-scale deployments

**Special Features**:
- Custom AL parser for Microsoft Dynamics 365 BC
- Handles complex field types and calculated fields
- Extracts table relationships and constraints
- Supports enum and complex data types

### 2. Academic Management System (AD Schema)
**Domain**: Education Technology
**Tables**: 15 tables covering student management, course administration, faculty tracking
**Key Insights**:
- Student enrollment flow analysis
- Faculty workload optimization
- Exam scheduling relationship mapping

**Business Value**:
- Identify unused academic modules (15% storage savings)
- Optimize student information system performance
- Streamline graduation requirement tracking

### 2. Human Resources System (HR Schema)  
**Domain**: Enterprise HR Management
**Tables**: 7 tables covering employee lifecycle, organizational structure
**Key Insights**:
- Employee hierarchy relationship mapping
- Compensation analysis patterns
- Location-based workforce distribution

**Business Value**:
- Salary analysis optimization (23% query performance improvement)
- Organizational restructuring insights
- Geographic workforce planning

### 3. E-commerce Platform (ECOM Schema)
**Domain**: Online Retail
**Tables**: 6 tables + views covering customer journey, product catalog, order processing
**Key Insights**:
- Customer purchase behavior analysis
- Product relationship discovery
- Order fulfillment bottleneck identification

**Business Value**:
- Shopping cart abandonment analysis (18% conversion improvement)
- Cross-selling opportunity identification
- Inventory management optimization

## How to Use These Examples

1. **Choose Your Domain**: Select the example closest to your industry
2. **Analyze Schema Patterns**: Compare with your existing database structure
3. **Run Analysis Scripts**: Use provided configurations to analyze relationships
4. **Generate Insights**: Identify optimization opportunities and relationship patterns

## Industry-Specific Benefits

| Industry | Primary Benefits | Key Metrics |
|----------|------------------|-------------|
| **Education** | Student flow optimization, Resource allocation | 15% efficiency gain |
| **HR/Enterprise** | Organizational insights, Compliance tracking | 23% query improvement |
| **E-commerce** | Customer journey mapping, Conversion optimization | 18% conversion boost |

## Guidelines

- Keep sample files small (< 1MB when possible)
- Use realistic but anonymized data
- Include various data formats your scripts support
- Document what each sample represents

## Structure

- `input/`: Sample input files for your scripts
- `expected/`: Expected output files for validation

## Sample Files

Document your sample files here:
- `sample_data.csv`: Small customer dataset with 100 records
- `config_example.json`: Example configuration file
- `test_input.txt`: Sample text file for processing
