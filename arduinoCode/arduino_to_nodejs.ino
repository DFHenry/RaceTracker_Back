#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 10
#define RST_PIN 7

MFRC522 rfid(SS_PIN, RST_PIN); // Instance of the class

MFRC522::MIFARE_Key key; 

void setup() {
  // put your setup code here, to run once:

}

void loop() {
  // put your main code here, to run repeatedly:

}
