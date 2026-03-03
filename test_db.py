from core.database import test_connection, run_query_to_dataframe

def main():
    print("Testing database connection...")
    success = test_connection()
    if success:
        print("✅ Database connected successfully!")
        print("Testing a simple query...")
        try:
            df = run_query_to_dataframe("SELECT current_user, current_database()")
            print(df)
            print("✅ Query ok!")
        except Exception as e:
            print(f"❌ Query failed: {e}")
    else:
        print("❌ Database connection failed!")

if __name__ == "__main__":
    main()
