from enum import Enum

from aiogram.filters.callback_data import CallbackData


class Profile(CallbackData, prefix="profile"):
    pass


class Psychologist(CallbackData, prefix="psychologist"):
    pass


class MainMenu(CallbackData, prefix="main_menu"):
    pass


class TechSupport(CallbackData, prefix="tech_support"):
    pass


class ContactTopic(str, Enum):
    SUPPORT = "Поддержка"
    PSYCHOLOGIST = "Подбор психолога"
    TRAINING = "Подбор обучения"


class ContactTopicChoice(CallbackData, prefix="contact_topic"):
    topic: ContactTopic


class AboutDiary(CallbackData, prefix="about_diary"):
    pass

class AboutTests(CallbackData, prefix="about_tests"):
    pass


class AboutProject(CallbackData, prefix="about_project"):
    pass


class TestCategoryDesc(CallbackData, prefix="test_cat_desc"):
    name: str
